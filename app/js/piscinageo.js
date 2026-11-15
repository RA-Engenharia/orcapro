/* =====================================================================
 * piscinageo.js — GERADOR PARAMÉTRICO DE MALHA DA PISCINA DE FIBRA E DA CASA DE MÁQUINAS DRY PUMP (04/11/2026)
 *
 *   PiscinaGeo.piscina(p)   casco por dentro + casca por fora + aba, água, borda atérmica, dispositivos
 *   PiscinaGeo.dryPump(p)   casa de máquinas Dry Pump (medidas fixas do desenho) + base de concreto opcional
 *
 * Porte do gerar_piscina.py da Casa 487 (Reforma Casa 487\12_piscina_tradicional), generalizado por parâmetros.
 * Com os parâmetros padrão reproduz a folha do fabricante 4,00 x 2,00 x 1,40. Motor puro (ES5, sem DOM, sem dependência).
 * Sem cache: quem chama guarda o resultado.
 *
 * ⚠ REGRAS DESTE ARQUIVO (cada uma existe por um defeito que ela impede)
 *  1. A Malha interna trabalha em (X, Y, Z) como no Python (Z para cima, Y = para cima no papel). Só na SAÍDA cada vértice
 *     vira [X, Z, -Y], o sistema do app. Essa rotação é própria (não troca o sentido das faces). Quem mexer na geometria
 *     mexe em X/Y/Z; quem mexer na saída mexe só em saida().
 *  2. Medida do fabricante tem fonte; o que não tem cota é "premissa RA" e está marcado:
 *       [PDF]  Splash, Tradicional-4x1-40m.pdf, folha 01/01: 4,00/3,80 x 2,00/1,80; borda 0,10; aba 0,04; linha 0,17;
 *              degraus 0,28; fundo 2,15 x 1,27; rampas 0,37. Raios, posição do degrau da ESCADA e recuo dos espelhos:
 *              medidos no vetor do PDF a 309 px/m.
 *       [IMG]  imagem "CASA DE MAQUINAS - DRY PUMP" (776/524 x 443/184, alturas 314/329/383): peças sem cota lidas na escala das cotas.
 *       [SITE] https://www.splashpiscinas.com/piscinas/tradicional (03/11/2026).
 *       [RA]   premissa: posição de skimmer/retornos/aspiração/ralo, borda atérmica, base de concreto da Dry Pump.
 *  3. Triângulo degenerado (|n|^2 < 1e-16) é descartado, como no Python: borda=0 ou aba=0 não deixam lixo na malha.
 *  4. anel() tem SEMPRE o mesmo número de pontos (4*(n+1)): é o que deixa costurar um anel no outro.
 *  5. Espelhar=true multiplica Y por -1 e INVERTE a ordem de cada triângulo (espelho troca a orientação; sem isso as faces viram do avesso).
 *  6. Vértices saem arredondados a 5 casas. Cada grupo tem os próprios vértices e índices (começam em 0).
 *  7. Sem NaN: parâmetro inválido (não numérico, fora do mínimo) volta ao padrão e entra em `avisos`.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------ utilidades */
  function arred(v) { return Math.round(v * 1e5) / 1e5 + 0; }          // "+ 0" tira o -0
  function rad(g) { return g * Math.PI / 180; }
  function ehNum(v) { return typeof v === "number" && isFinite(v); }
  function booleano(v, def) { return (v === undefined || v === null) ? def : !!v; }

  /* ------------------------------------------------------------------ malha */
  function Malha() { this.v = []; this.grupos = {}; this.ordem = []; }
  Malha.prototype._grupo = function (mat) {
    if (!Object.prototype.hasOwnProperty.call(this.grupos, mat)) { this.grupos[mat] = []; this.ordem.push(mat); }
    return this.grupos[mat];
  };
  Malha.prototype.pts = function (lista) {
    var i0 = this.v.length;
    for (var i = 0; i < lista.length; i++) this.v.push([+lista[i][0], +lista[i][1], +lista[i][2]]);
    return i0;
  };
  Malha.prototype.tri = function (mat, a, b, c) {
    var p = this.v[a], q = this.v[b], r = this.v[c];
    var u0 = q[0] - p[0], u1 = q[1] - p[1], u2 = q[2] - p[2], w0 = r[0] - p[0], w1 = r[1] - p[1], w2 = r[2] - p[2];
    var n0 = u1 * w2 - u2 * w1, n1 = u2 * w0 - u0 * w2, n2 = u0 * w1 - u1 * w0;
    if (n0 * n0 + n1 * n1 + n2 * n2 < 1e-16) return;
    var g = this._grupo(mat); g.push(a, b, c);
  };
  Malha.prototype.quad = function (mat, a, b, c, d) {
    var i = this.pts([a, b, c, d]); this.tri(mat, i, i + 1, i + 2); this.tri(mat, i, i + 2, i + 3);
  };
  Malha.prototype.dupla = function (mat, a, b, c, d) { this.quad(mat, a, b, c, d); this.quad(mat, d, c, b, a); };
  /* liga dois anéis com o mesmo número de pontos, ambos anti-horários vistos de cima, A acima de B */
  Malha.prototype.costura = function (mat, A, B, paraDentro) {
    var n = A.length, ia = this.pts(A), ib = this.pts(B);
    for (var k = 0; k < n; k++) {
      var a0 = ia + k, a1 = ia + (k + 1) % n, b0 = ib + k, b1 = ib + (k + 1) % n;
      if (paraDentro) { this.tri(mat, a0, a1, b1); this.tri(mat, a0, b1, b0); }
      else { this.tri(mat, a0, b0, b1); this.tri(mat, a0, b1, a1); }
    }
  };
  Malha.prototype.tampa = function (mat, anelPts, paraCima) {
    var n = anelPts.length, sx = 0, sy = 0, k;
    for (k = 0; k < n; k++) { sx += anelPts[k][0]; sy += anelPts[k][1]; }
    var i0 = this.pts([[sx / n, sy / n, anelPts[0][2]]]), ia = this.pts(anelPts);
    for (k = 0; k < n; k++) {
      if (paraCima) this.tri(mat, i0, ia + k, ia + (k + 1) % n);
      else this.tri(mat, i0, ia + (k + 1) % n, ia + k);
    }
  };
  /* base e topo com o mesmo número de pontos (convexos), anti-horários vistos de cima */
  Malha.prototype.prisma = function (mat, base, topo) {
    var n = base.length, k, j;
    for (k = 0; k < n; k++) { j = (k + 1) % n; this.quad(mat, base[k], base[j], topo[j], topo[k]); }
    this.quadFan(mat, base.slice().reverse()); this.quadFan(mat, topo);
  };
  Malha.prototype.caixa = function (mat, x0, x1, y0, y1, z0, z1, recuoTopo) {
    var r = recuoTopo || 0;
    this.prisma(mat, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
                     [[x0 + r, y0 + r, z1], [x1 - r, y0 + r, z1], [x1 - r, y1 - r, z1], [x0 + r, y1 - r, z1]]);
  };
  Malha.prototype.quadFan = function (mat, pts) {
    var i = this.pts(pts);
    for (var k = 1; k < pts.length - 1; k++) this.tri(mat, i, i + k, i + k + 1);
  };
  /* perfil [[raio, altura]]: gira em volta do eixo. eixo z: altura = z. eixo x: altura = x, centro em (cy, cz). eixo y: altura = y, centro em (cx, cz) */
  Malha.prototype.revolucao = function (mat, cx, cy, perfil, seg, eixo, cz) {
    seg = seg || 28; eixo = eixo || "z"; cz = cz || 0;
    function P(r, h, a) {
      var c = r * Math.cos(a), s = r * Math.sin(a);
      if (eixo === "z") return [cx + c, cy + s, h];
      if (eixo === "x") return [h, cy + s, cz + c];
      return [cx + c, h, cz + s];
    }
    for (var k = 0; k < perfil.length - 1; k++) {
      var r0 = perfil[k][0], h0 = perfil[k][1], r1 = perfil[k + 1][0], h1 = perfil[k + 1][1];
      for (var q = 0; q < seg; q++) {
        var a0 = 2 * Math.PI * q / seg, a1 = 2 * Math.PI * (q + 1) / seg;
        var a = P(r0, h0, a0), b = P(r0, h0, a1), c = P(r1, h1, a1), d = P(r1, h1, a0);
        if (eixo === "z" || eixo === "y") this.quad(mat, a, b, c, d); else this.quad(mat, d, c, b, a);
      }
    }
  };
  /* varre um círculo por uma poligonal ortogonal; cada trecho é um cilindro fechado por uma esfera baixa no nó */
  Malha.prototype.tubo = function (mat, caminho, raio, seg) {
    seg = seg || 12;
    var self = this;
    for (var t = 0; t < caminho.length - 1; t++) {
      var a = caminho[t], b = caminho[t + 1];
      var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
      if (L < 1e-6) continue;
      d = [d[0] / L, d[1] / L, d[2] / L];
      var e = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      var u = [d[1] * e[2] - d[2] * e[1], d[2] * e[0] - d[0] * e[2], d[0] * e[1] - d[1] * e[0]];
      var nu = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]); u = [u[0] / nu, u[1] / nu, u[2] / nu];
      var w = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
      var Cc = (function (u, w) {
        return function (p, q) {
          var an = 2 * Math.PI * q / seg, ca = Math.cos(an) * raio, sa = Math.sin(an) * raio;
          return [p[0] + u[0] * ca + w[0] * sa, p[1] + u[1] * ca + w[1] * sa, p[2] + u[2] * ca + w[2] * sa];
        };
      })(u, w);
      for (var q = 0; q < seg; q++) self.quad(mat, Cc(a, q), Cc(b, q), Cc(b, q + 1), Cc(a, q + 1));
    }
    for (var i = 0; i < caminho.length; i++) {
      var p = caminho[i];
      this.revolucao(mat, p[0], p[1], [[0, p[2] - raio], [raio * 0.8, p[2] - raio * 0.6], [raio, p[2]], [raio * 0.8, p[2] + raio * 0.6], [0, p[2] + raio]], seg);
    }
  };
  /* polígono em (x, z), extrudado em y, dupla face */
  Malha.prototype.extrusaoY = function (mat, poligono, y0, y1) {
    var A = [], B = [], pl = [];
    for (var i = 0; i < poligono.length; i++) { A.push([poligono[i][0], y0, poligono[i][1]]); B.push([poligono[i][0], y1, poligono[i][1]]); pl.push([poligono[i][0], poligono[i][1]]); }
    this._ext(mat, A, B, pl);
  };
  /* polígono em (y, z), extrudado em x, dupla face */
  Malha.prototype.extrusaoX = function (mat, poligono, x0, x1) {
    var A = [], B = [], pl = [];
    for (var i = 0; i < poligono.length; i++) { A.push([x0, poligono[i][0], poligono[i][1]]); B.push([x1, poligono[i][0], poligono[i][1]]); pl.push([poligono[i][0], poligono[i][1]]); }
    this._ext(mat, A, B, pl);
  };
  Malha.prototype._ext = function (mat, A, B, plano) {
    var tri = orelhas(plano), n = A.length, ia = this.pts(A), ib = this.pts(B), i, t, k, j;
    for (i = 0; i < tri.length; i++) {
      t = tri[i];
      this.tri(mat, ia + t[0], ia + t[1], ia + t[2]); this.tri(mat, ia + t[2], ia + t[1], ia + t[0]);
      this.tri(mat, ib + t[0], ib + t[1], ib + t[2]); this.tri(mat, ib + t[2], ib + t[1], ib + t[0]);
    }
    for (k = 0; k < n; k++) {
      j = (k + 1) % n;
      this.tri(mat, ia + k, ia + j, ib + j); this.tri(mat, ia + k, ib + j, ib + k);
      this.tri(mat, ib + j, ia + j, ia + k); this.tri(mat, ib + k, ib + j, ia + k);
    }
  };
  /* translada todos os vértices (usado para subir a Dry Pump sobre a base) */
  Malha.prototype.transladar = function (dx, dy, dz) {
    for (var i = 0; i < this.v.length; i++) { this.v[i][0] += dx; this.v[i][1] += dy; this.v[i][2] += dz; }
  };
  /* espelhar: Y -> -Y e ordem do triângulo invertida. Saída: [X, Z, -Y], vértices só dos usados por cada grupo. */
  Malha.prototype.saida = function (espelhar) {
    var grupos = [];
    for (var o = 0; o < this.ordem.length; o++) {
      var mat = this.ordem[o], g = this.grupos[mat];
      if (!g.length) continue;
      var mapa = {}, v = [], f = [];
      for (var t = 0; t < g.length; t += 3) {
        var ids = [g[t], g[t + 1], g[t + 2]];
        if (espelhar) ids = [ids[0], ids[2], ids[1]];
        for (var s = 0; s < 3; s++) {
          var id = ids[s];
          if (mapa[id] === undefined) {
            var p = this.v[id], y = espelhar ? -p[1] : p[1];
            mapa[id] = v.length / 3;
            v.push(arred(p[0]), arred(p[2]), arred(-y));
          }
          f.push(mapa[id]);
        }
      }
      grupos.push({ material: mat, v: v, f: f });
    }
    return grupos;
  };

  /* triangulação por orelhas de polígono simples 2D */
  function orelhas(pol) {
    var n = pol.length, area = 0, i, j;
    for (i = 0; i < n; i++) { j = (i + 1) % n; area += pol[i][0] * pol[j][1] - pol[j][0] * pol[i][1]; }
    area /= 2;
    var idx = []; for (i = 0; i < n; i++) idx.push(i);
    if (!(area > 0)) idx.reverse();
    function cruz(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    var out = [], guarda = 0;
    while (idx.length > 3 && guarda < 20000) {
      guarda++;
      var achou = false;
      for (var k = 0; k < idx.length; k++) {
        var i0 = idx[(k - 1 + idx.length) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
        var a = pol[i0], b = pol[i1], c = pol[i2];
        if (cruz(a, b, c) <= 1e-12) continue;
        var dentro = false;
        for (var m = 0; m < idx.length; m++) {
          var q = idx[m];
          if (q === i0 || q === i1 || q === i2) continue;
          var pq = pol[q];
          if (cruz(a, b, pq) >= -1e-12 && cruz(b, c, pq) >= -1e-12 && cruz(c, a, pq) >= -1e-12) { dentro = true; break; }
        }
        if (dentro) continue;
        out.push([i0, i1, i2]); idx.splice(k, 1); achou = true; break;
      }
      if (!achou) throw new Error("poligono nao triangulou");
    }
    out.push(idx.slice());
    return out;
  }

  /* retângulo arredondado anti-horário visto de cima, sempre com 4*(n+1) pontos (para costurar) */
  function anel(xmin, xmax, b, rL, rR, z, n, ymin) {
    n = n || 6;
    if (ymin === undefined || ymin === null) ymin = -b;
    var pts = [], cantos = [[xmax - rR, b - rR, rR, 0], [xmin + rL, b - rL, rL, 90], [xmin + rL, ymin + rL, rL, 180], [xmax - rR, ymin + rR, rR, 270]];
    for (var c = 0; c < 4; c++) {
      for (var k = 0; k <= n; k++) {
        var a = rad(cantos[c][3] + 90.0 * k / n);
        pts.push([cantos[c][0] + cantos[c][2] * Math.cos(a), cantos[c][1] + cantos[c][2] * Math.sin(a), z]);
      }
    }
    return pts;
  }

  /* ------------------------------------------------------------------ parâmetros da piscina */
  var PADRAO = {
    Comprimento: 4.0, Largura: 2.0, Profundidade: 1.4, Borda_fibra: 0.10, Aba: 0.04, Raio_borda: 0.21, Linha_agua: 0.17,
    Rampa_fundo: 0.37, Alt_degrau: 0.28, Piso_degrau: 0.28, Espelho_avanco: 0.055, Assento_abaixo: 0.56,
    Borda_atermica: 0.30, Esp_atermica: 0.06, Folga_cava: 0.20, Lastro: 0.10
  };
  var MINIMO = {
    Comprimento: 1.0, Largura: 1.0, Profundidade: 0.6, Borda_fibra: 0.03, Aba: 0, Raio_borda: 0.01, Linha_agua: 0.05,
    Rampa_fundo: 0.15, Alt_degrau: 0.1, Piso_degrau: 0.05, Espelho_avanco: 0, Assento_abaixo: 0.3,
    Borda_atermica: 0, Esp_atermica: 0.005, Folga_cava: 0, Lastro: 0
  };

  function normalizar(p) {
    p = p || {};
    var avisos = [], q = {}, nome;
    for (nome in PADRAO) {
      if (!Object.prototype.hasOwnProperty.call(PADRAO, nome)) continue;
      var v = p[nome];
      if (v === undefined || v === null) { q[nome] = PADRAO[nome]; continue; }
      if (!ehNum(v) || v < MINIMO[nome]) {
        avisos.push("Parâmetro " + nome + " inválido (" + v + "): usei o padrão " + PADRAO[nome] + ".");
        q[nome] = PADRAO[nome];
      } else q[nome] = v;
    }
    q.Com_agua = booleano(p.Com_agua, true);
    q.Com_dispositivos = booleano(p.Com_dispositivos, true);
    q.Espelhar = booleano(p.Espelhar, false);
    q.Com_degrau_escada = booleano(p.Com_degrau_escada, true);
    var P = q.Profundidade, hl = q.Largura / 2;
    if (q.Linha_agua > P - 0.3) { avisos.push("Linha_agua incompatível com a Profundidade: ajustada."); q.Linha_agua = Math.max(0.05, P - 0.3); }
    if (q.Assento_abaixo < q.Linha_agua + 0.1) { avisos.push("Assento_abaixo muito perto da linha d'água: ajustado."); q.Assento_abaixo = q.Linha_agua + 0.1; }
    if (q.Assento_abaixo > P - 0.15) { avisos.push("Assento_abaixo muito fundo para a Profundidade: ajustado."); q.Assento_abaixo = P - 0.15; }
    if (q.Rampa_fundo < q.Borda_fibra + 0.05) { avisos.push("Rampa_fundo menor que a borda: ajustada."); q.Rampa_fundo = q.Borda_fibra + 0.05; }
    if (hl - q.Rampa_fundo < 0.3) { avisos.push("Rampa_fundo come a largura do fundo: ajustada."); q.Rampa_fundo = hl - 0.3; }
    q.avisos = avisos;
    return q;
  }

  /* geometria derivada: perfis e pilha de anéis (generaliza PILHA do Python). X+ = lado da escada. */
  function geometria(q) {
    var hc = q.Comprimento / 2, hl = q.Largura / 2, P = q.Profundidade, LA = q.Linha_agua, A = q.Assento_abaixo;
    var a = hc - q.Borda_fibra, b = hl - q.Borda_fibra;
    var incl = (q.Rampa_fundo - q.Borda_fibra - 0.025) / (P - LA);         // 0,245/1,23 com os padrões
    var g = { hc: hc, hl: hl, P: P, LA: LA, A: A, a: a, b: b, incl: incl, avisos: [] };
    g.meiaLarg = function (z) { return (b - 0.025) - (Math.abs(z) - LA) * incl; };
    g.fundoX = function (z) { return (a - 0.025) - (Math.abs(z) - LA) * incl; };
    g.paredeEscada = function (z) { return (hc - 0.125) - (Math.abs(z) - LA) * (0.075 / (A - LA)); };

    var N = Math.max(1, Math.round((P - A) / q.Alt_degrau)), h = (P - A) / N;
    var Xb = hc - 0.754, esp = q.Espelho_avanco, piso = q.Piso_degrau;
    var xFimMin = -(hc - q.Rampa_fundo) + 0.3, xFim = Xb - N * esp - (N - 1) * piso;
    if (xFim < xFimMin) {
      if (N > 1) {
        var novo = (Xb - N * esp - xFimMin) / (N - 1);
        if (novo < 0.05) novo = 0.05;
        g.avisos.push("Escada do fundo não cabe no comprimento: Piso_degrau reduzido de " + piso.toFixed(3) + " para " + novo.toFixed(3) + " m.");
        piso = novo;
      } else g.avisos.push("Escada do fundo não cabe no comprimento: aumente Comprimento ou reduza Rampa_fundo.");
    }
    var rows = [
      { z: 0, xd: a, rR: 0.12 },
      { z: -LA, xd: hc - 0.125, rR: 0.12 },
      { z: -A, xd: hc - 0.20, rR: 0.10 },     // parede até o assento
      { z: -A, xd: Xb, rR: 0.03 }             // frente do banco
    ];
    var x = Xb;
    for (var k = 1; k <= N; k++) {
      var z = (k === N) ? -P : -A - k * h;
      x -= esp; rows.push({ z: z, xd: x, rR: 0.03 });        // espelho
      if (k < N) { x -= piso; rows.push({ z: z, xd: x, rR: 0.03 }); }   // piso
    }
    g.rows = rows; g.N = N; g.h = h; g.piso = piso;
    g.esc = {
      xTopo: hc - 0.44, xBase: hc - 0.495, yTopo: -(hl - 0.73), yBase: -(hl - 0.70),
      zBase: -A, zTopo: -(A - q.Alt_degrau)
    };
    return g;
  }

  function pilhaAneis(g, folga) {
    var out = [];
    for (var i = 0; i < g.rows.length; i++) {
      var r = g.rows[i], zz = r.z < -0.01 ? r.z - folga : r.z;
      var xe = (i === 0) ? g.a : g.fundoX(r.z), yb = (i === 0) ? g.b : g.meiaLarg(r.z);
      out.push(anel(-xe - folga, r.xd + folga, yb + folga, 0.12 + folga, r.rR + folga, zz));
    }
    return out;
  }

  /* litros abaixo da linha d'água: integra as seções da pilha e desconta o degrau da escada */
  function volumeAgua(q, g) {
    var rows = g.rows;
    function xdEm(z) {
      for (var i = 1; i < rows.length - 1; i++) {
        var z0 = rows[i].z, z1 = rows[i + 1].z;
        if (z0 > z1 && z <= z0 && z >= z1) return rows[i].xd + (rows[i + 1].xd - rows[i].xd) * (z0 - z) / (z0 - z1);
      }
      return rows[rows.length - 1].xd;
    }
    var n = Math.max(100, Math.round((g.P - g.LA) * 1000)), dz = (g.P - g.LA) / n, L = 0;
    for (var i = 0; i < n; i++) {
      var z = -g.LA - (i + 0.5) * dz;
      L += (g.fundoX(z) + xdEm(z)) * (g.meiaLarg(z) * 2) * dz;
    }
    if (q.Com_degrau_escada) {
      var e = g.esc, zm = -(g.A - q.Alt_degrau / 2);
      L -= (g.paredeEscada(zm) - (e.xTopo + e.xBase) / 2) * (g.meiaLarg(zm) - (Math.abs(e.yTopo) + Math.abs(e.yBase)) / 2) * q.Alt_degrau;
    }
    return L * 1000.0;
  }

  /* portas e recorte: UMA conta só, usada por piscina() e pelas funções públicas (piscinaderiv.js chama sem gerar malha) */
  function arredObj(o) { var r = {}, c; for (c in o) if (Object.prototype.hasOwnProperty.call(o, c)) r[c] = (typeof o[c] === "number") ? arred(o[c]) : o[c]; return r; }
  function portasDe(q, g) {
    var hc = g.hc, hl = g.hl, sg = q.Espelhar ? -1 : 1;     // portas em coordenadas do app: z = -Y (e Y<0 => z>0)
    return {
      skimmer: arredObj({ x: hc - 1.145, y: -0.60, z: sg * (hl + 0.15) }),
      ralo: arredObj({ x: -hc + 1.45, y: -g.P, z: 0 }),
      retornos: [arredObj({ x: hc - 1.46, y: -0.40, z: sg * g.meiaLarg(-0.40) }), arredObj({ x: -hc + 0.84, y: -0.40, z: sg * g.meiaLarg(-0.40) })],
      aspiracao: arredObj({ x: -0.36 * (hc / 2), y: -0.35, z: sg * g.meiaLarg(-0.35) }),
      lado: sg
    };
  }
  function recorteDe(q) { return { hC: arred(q.Comprimento / 2 + q.Borda_atermica), hL: arred(q.Largura / 2 + q.Borda_atermica) }; }
  function portasPiscina(p) { var q = normalizar(p); return portasDe(q, geometria(q)); }
  function recortePiscina(p) { return recorteDe(normalizar(p)); }

  /* ------------------------------------------------------------------ piscina */
  function piscina(p) {
    var q = normalizar(p), g = geometria(q), avisos = q.avisos.concat(g.avisos);
    var m = new Malha(), F = "Fibra Splash azul", MA = "Borda atermica", MB = "Dispositivo branco", MP = "Dispositivo preto";
    var hc = g.hc, hl = g.hl, P = g.P, LA = g.LA, i, k, j, n;
    var A = pilhaAneis(g, 0);
    for (i = 0; i < A.length - 1; i++) m.costura(F, A[i], A[i + 1], true);
    m.tampa(F, A[A.length - 1], true);

    // degrau da ESCADA, sobre o banco, no canto (lado -Y do desenho)
    if (q.Com_degrau_escada) {
      var e = g.esc, zb = e.zBase, zt = e.zTopo;
      var xwB = g.paredeEscada(zb) + 0.03, xwT = g.paredeEscada(zt) + 0.03;
      var ywB = -g.meiaLarg(zb) - 0.03, ywT = -g.meiaLarg(zt) - 0.03;
      m.quad(F, [e.xTopo, ywT, zt], [xwT, ywT, zt], [xwT, e.yTopo, zt], [e.xTopo, e.yTopo, zt]);
      m.quad(F, [e.xBase, ywB, zb], [e.xTopo, ywT, zt], [e.xTopo, e.yTopo, zt], [e.xBase, e.yBase, zb]);
      m.quad(F, [e.xBase, e.yBase, zb], [e.xTopo, e.yTopo, zt], [xwT, e.yTopo, zt], [xwB, e.yBase, zb]);
    }

    // casca por fora + aba: o casco fica fechado e aparece certo em corte
    var B = pilhaAneis(g, 0.015);
    B[0] = B[0].map(function (pt) { return [pt[0], pt[1], -q.Aba]; });
    for (i = 0; i < B.length - 1; i++) m.costura(F, B[i], B[i + 1], false);
    m.tampa(F, B[B.length - 1], false);
    var ext = anel(-hc, hc, hl, q.Raio_borda, q.Raio_borda, 0);
    var extB = ext.map(function (pt) { return [pt[0], pt[1], -q.Aba]; });
    n = ext.length;
    for (k = 0; k < n; k++) { j = (k + 1) % n; m.quad(F, ext[k], ext[j], A[0][j], A[0][k]); }
    m.costura(F, ext, extB, false);
    for (k = 0; k < n; k++) { j = (k + 1) % n; m.quad(F, extB[j], extB[k], B[0][k], B[0][j]); }

    // borda atérmica [RA]: anel plano de topo em z=0, fechado (topo, face externa, face interna, fundo)
    if (q.Borda_atermica > 0) {
      var hC = hc + q.Borda_atermica, hL = hl + q.Borda_atermica, ez = -q.Esp_atermica;
      var O = anel(-hC, hC, hL, 0.001, 0.001, 0), Ob = O.map(function (pt) { return [pt[0], pt[1], ez]; });
      var Ib = ext.map(function (pt) { return [pt[0], pt[1], ez]; });
      for (k = 0; k < n; k++) {
        j = (k + 1) % n;
        m.quad(MA, O[k], O[j], ext[j], ext[k]);          // topo
        m.quad(MA, Ib[k], Ib[j], Ob[j], Ob[k]);          // fundo
      }
      m.costura(MA, O, Ob, false);                        // face externa
      m.costura(MA, ext, Ib, true);                       // face interna
    }

    // água: lâmina dupla-face na linha d'água
    if (q.Com_agua) {
      var agua = anel(-g.fundoX(-LA) - 0.002, (hc - 0.125) + 0.002, g.meiaLarg(-LA) + 0.002, 0.12, 0.12, -LA);
      m.tampa("Agua da piscina RA", agua, true); m.tampa("Agua da piscina RA", agua, false);
    }

    // dispositivos [SITE: skimmer, retorno, aspiração; posição = premissa RA]
    var Xsk = hc - 1.145, XrA = hc - 1.46, XrB = -hc + 0.84, Xasp = -0.36 * (hc / 2), Xralo = -hc + 1.45;
    var yw = -g.meiaLarg(-(LA + 0.02));
    if (q.Com_dispositivos) {
      m.caixa(MB, Xsk - 0.11, Xsk + 0.11, yw - 0.02, yw + 0.006, -LA - 0.09, -LA + 0.05);
      m.caixa(MP, Xsk - 0.09, Xsk + 0.09, yw + 0.0035, yw + 0.0075, -LA - 0.075, -LA + 0.035);
      m.caixa(MB, Xsk - 0.13, Xsk + 0.13, -(hl + 0.30), -(hl - 0.10), -0.60, -0.05);
      m.revolucao(MB, Xsk, -(hl + 0.15), [[0, -0.05], [0.115, -0.05], [0.115, 0.008], [0.10, 0.012], [0, 0.012]]);
      var bocas = [[XrA, 0.028, -0.40], [XrB, 0.028, -0.40], [Xasp, 0.036, -0.35]];
      for (i = 0; i < bocas.length; i++) {
        var X = bocas[i][0], r = bocas[i][1], z0 = bocas[i][2], y0 = -g.meiaLarg(z0);
        m.revolucao(MB, X, 0, [[0, y0 + 0.018], [r * 0.55, y0 + 0.018], [r, y0 + 0.006], [r, y0 - 0.01], [0, y0 - 0.01]], 28, "y", z0);
      }
      m.revolucao(MB, Xralo, 0, [[0, -P], [0.11, -P], [0.11, -P + 0.008], [0.09, -P + 0.013], [0, -P + 0.013]]);
    }

    var portas = portasDe(q, g);

    return {
      grupos: m.saida(q.Espelhar), portas: portas,
      recorte: recorteDe(q),
      cava: { C: arred(q.Comprimento + 2 * q.Folga_cava), L: arred(q.Largura + 2 * q.Folga_cava), H: arred(P + q.Lastro) },
      volumeAguaL: Math.round(volumeAgua(q, g) * 10) / 10,
      avisos: avisos
    };
  }

  /* ------------------------------------------------------------------ Dry Pump [IMG] */
  function dryNorm(p) {
    p = p || {};
    var avisos = [], conf = { Base_C: 0.86, Base_L: 0.50, Base_esp: 0.07, Base_acima: 0.01 }, nome;
    var q = { Com_base: booleano(p.Com_base, true) };
    for (nome in conf) {
      if (!Object.prototype.hasOwnProperty.call(conf, nome)) continue;
      var v = p[nome];
      if (v === undefined || v === null) q[nome] = conf[nome];
      else if (!ehNum(v) || v <= 0) { avisos.push("Parâmetro " + nome + " inválido (" + v + "): usei o padrão " + conf[nome] + "."); q[nome] = conf[nome]; }
      else q[nome] = v;
    }
    q.avisos = avisos;
    return q;
  }
  function dryPortas(q) {
    function mm(v) { return v / 1000.0; }
    var sobe = q.Com_base ? q.Base_acima : 0, zr = arred(-(mm(135) - 0.2215)), X = function (v) { return mm(v) - 0.258; };
    return {
      succao: { x: arred(X(733)), y: arred(sobe + mm(12)), z: 0 },
      retorno: { x: arred(X(168)), y: arred(sobe + mm(93)), z: zr },
      hidroterapia: { x: arred(X(248)), y: arred(sobe + mm(93)), z: zr },
      drenagem: { x: arred(X(327)), y: arred(sobe + mm(93)), z: zr }
    };
  }
  function portasDryPump(p) { return dryPortas(dryNorm(p)); }
  function dryPump(p) {
    var q = dryNorm(p), avisos = q.avisos;
    var m = new Malha(), T = "Tampa Dry Pump", E = "Equipamento cinza escuro", PR = "Equipamento preto RA", C = "Equipamento cinza claro", B = "PVC branco", L = "Etiqueta Dry Pump";
    var ox = 0.258, oy = 0.2215;                 // origem no centro da tampa
    function mm(v) { return v / 1000.0; }
    function X(v) { return mm(v) - ox; }
    function Y(v) { return mm(v) - oy; }
    var Z = mm, esp = 4;
    function arco(cx, cz, r, a0, a1, n) {
      n = n || 6; var o = [];
      for (var k = 0; k <= n; k++) { var an = rad(a0 + (a1 - a0) * k / n); o.push([cx + r * Math.cos(an), cz + r * Math.sin(an)]); }
      return o;
    }
    function lista(pares, fx, fy) { return pares.map(function (t) { return [fx(t[0]), fy(t[1])]; }); }
    var i, k;
    // paredes: contorno lido das vistas (cotas 516 x 443, alturas 329/383)
    var frente = [[20, 0], [73, 0]].concat(arco(125, 215, 34, 180, 90), arco(403, 215, 34, 90, 0), [[456, 0], [500, 0], [500, 282], [20, 282]]);
    m.extrusaoY(T, lista(frente, X, Z), Y(15), Y(15 + esp));
    m.extrusaoY(T, lista([[20, 0], [500, 0], [500, 329], [20, 329]], X, Z), Y(426 - esp), Y(426));
    var perfil = [[15, 0], [426, 0], [426, 329], [203, 329], [57, 325], [15, 282]];
    m.extrusaoX(T, lista(perfil, Y, Z), X(16), X(20));
    var dir = [[15, 0], [113, 0]].concat(arco(221, 150, 91, 180, 0, 10), [[327, 0], [426, 0], [426, 329], [203, 329], [57, 325], [15, 282]]);
    m.extrusaoX(T, lista(dir, Y, Z), X(500), X(500 + esp));
    // telhado
    function Pt(a, b, h) { return [X(a), Y(b), Z(h)]; }
    var xa = 16, xb = 504;
    m.dupla(T, Pt(xa, 15, 282), Pt(xb, 15, 282), Pt(xb, 57, 325), Pt(xa, 57, 325));
    m.dupla(T, Pt(xa, 57, 325), Pt(xb, 57, 325), Pt(xb, 203, 329), Pt(xa, 203, 329));
    var tx0 = 127, tx1 = 403, ty0 = 246, ty1 = 382, h0 = 329, h1 = 383;
    m.dupla(T, Pt(xa, 203, h0), Pt(xb, 203, h0), Pt(tx1, ty0, h1), Pt(tx0, ty0, h1));
    m.dupla(T, Pt(xb, 203, h0), Pt(xb, 426, h0), Pt(tx1, ty1, h1), Pt(tx1, ty0, h1));
    m.dupla(T, Pt(xb, 426, h0), Pt(xa, 426, h0), Pt(tx0, ty1, h1), Pt(tx1, ty1, h1));
    m.dupla(T, Pt(xa, 426, h0), Pt(xa, 203, h0), Pt(tx0, ty0, h1), Pt(tx0, ty1, h1));
    m.dupla(T, Pt(tx0, ty0, h1), Pt(tx1, ty0, h1), Pt(tx1, ty1, h1), Pt(tx0, ty1, h1));
    m.caixa(L, X(180), X(341), Y(282), Y(353), Z(383), Z(385));
    // friso em 282 (linha da vista de frente) e aba do pé (516 x 443)
    m.caixa(T, X(16), X(504), Y(13), Y(15), Z(278), Z(282));
    var abas = [[0, 516, 426, 443], [0, 73, 0, 15], [456, 516, 0, 15], [0, 16, 15, 426], [504, 516, 15, 113], [504, 516, 327, 426]];
    for (i = 0; i < abas.length; i++) m.caixa(T, X(abas[i][0]), X(abas[i][1]), Y(abas[i][2]), Y(abas[i][3]), Z(0), Z(8));
    var xns = [40, 450];
    for (i = 0; i < 2; i++) {
      m.caixa(T, X(xns[i]), X(xns[i] + 26), Y(0), Y(15), Z(0), Z(157));
      m.caixa(T, X(xns[i]), X(xns[i] + 26), Y(426), Y(443), Z(0), Z(247));
    }
    // base (524 x 184, cota) e pé do motor
    m.caixa(E, X(136), X(660), Y(129.5), Y(313.5), Z(0), Z(43), mm(6));
    m.caixa(E, X(238), X(337), Y(165), Y(278), Z(43), Z(58), mm(6));
    m.caixa(E, X(262), X(313), Y(190), Y(253), Z(58), Z(80), mm(6));
    // motor, flange e voluta: eixo X na altura 135, centro da largura
    var yc = Y(221.5), zc = Z(135);
    m.revolucao(PR, 0, yc, [[0, X(200)], [mm(52), X(200)], [mm(60), X(214)], [mm(60), X(372)], [mm(52), X(384)], [0, X(384)]], 28, "x", zc);
    for (k = 0; k < 16; k++) {
      var an = 2 * Math.PI * k / 16;
      m.caixa(PR, X(218), X(368), yc + mm(62) * Math.cos(an) - mm(2.5), yc + mm(62) * Math.cos(an) + mm(2.5), zc + mm(62) * Math.sin(an) - mm(2.5), zc + mm(62) * Math.sin(an) + mm(2.5));
    }
    m.revolucao(E, 0, yc, [[0, X(384)], [mm(58), X(384)], [mm(58), X(397)], [mm(92), X(397)], [mm(92), X(403)], [mm(70), X(403)], [mm(70), X(425)], [mm(92), X(425)], [mm(92), X(431)], [mm(86), X(445)], [mm(66), X(535)], [0, X(535)]], 28, "x", zc);
    var pars = [[60, 60], [-60, 60], [60, -60], [-60, -60]];
    for (i = 0; i < 4; i++) m.revolucao(PR, 0, yc + mm(pars[i][0]), [[0, X(392)], [mm(7), X(392)], [mm(7), X(436)], [0, X(436)]], 8, "x", zc + mm(pars[i][1]));
    var nerv = [34, -34];
    for (i = 0; i < 2; i++) m.caixa(E, X(505), X(590), yc - mm(55), yc + mm(55), zc + mm(nerv[i]) - mm(5), zc + mm(nerv[i]) + mm(5));
    // pré-filtro (tampa com a marca: diâmetro 151, topo 314)
    var xp = X(589), yp = Y(221.5);
    m.revolucao(E, xp, yp, [[0, Z(43)], [mm(64), Z(43)], [mm(63.5), Z(60)], [mm(60), Z(268)], [mm(64), Z(273)], [0, Z(273)]]);
    m.revolucao(PR, xp, yp, [[0, Z(268)], [mm(75.5), Z(273)], [mm(75.5), Z(299)], [mm(68), Z(303)], [mm(50), Z(311)], [mm(25), Z(314)], [0, Z(314)]], 36);
    for (k = 0; k < 20; k++) {
      var an2 = 2 * Math.PI * k / 20, cx = xp + mm(75.5) * Math.cos(an2), cy = yp + mm(75.5) * Math.sin(an2);
      m.caixa(PR, cx - mm(3), cx + mm(3), cy - mm(3), cy + mm(3), Z(275), Z(298));
    }
    m.revolucao(C, xp, yp, [[mm(40), Z(310.5)], [mm(40), Z(312.5)], [0, Z(315)]], 24);
    // saída para o cotovelo e descida com união até 12 mm do piso (cota total 776)
    var zt = Z(233), xv = X(733);
    m.revolucao(E, 0, yp, [[0, X(640)], [mm(29.5), X(640)], [mm(29.5), X(679)], [mm(33), X(679)], [mm(33), X(688)], [mm(29.5), X(688)], [mm(29.5), X(703)], [0, X(703)]], 28, "x", zt);
    var cam = [];
    for (var ag = 0; ag <= 90; ag += 15) cam.push([X(703) + mm(30) * Math.sin(rad(ag)), yp, zt - mm(30) + mm(30) * Math.cos(rad(ag))]);
    for (i = 0; i < cam.length - 1; i++) m.tubo(E, [cam[i], cam[i + 1]], mm(28), 16);
    m.revolucao(E, xv, yp, [[0, Z(185)], [mm(28), Z(185)], [mm(28), Z(203)], [0, Z(203)]]);
    m.revolucao(PR, xv, yp, [[0, Z(166)], [mm(24), Z(166)], [mm(24), Z(185)], [0, Z(185)]]);
    m.revolucao(PR, xv, yp, [[0, Z(135)], [mm(45), Z(135)], [mm(45), Z(165)], [0, Z(165)]], 32);
    m.revolucao(PR, xv, yp, [[0, Z(116)], [mm(26), Z(116)], [mm(26), Z(135)], [0, Z(135)]]);
    m.revolucao(B, xv, yp, [[0, Z(12)], [mm(20), Z(12)], [mm(20), Z(116)], [0, Z(116)]]);
    // registros: três, nas medidas da vista de frente (retorno, hidroterapia, drenagem - SITE)
    var yv = Y(135), regs = [168, 248, 327];
    for (i = 0; i < 3; i++) {
      var xr = X(regs[i]);
      m.revolucao(E, xr, yv, [[0, Z(237)], [mm(22), Z(242)], [0, Z(242)]]);
      m.revolucao(E, xr, yv, [[mm(34.5), Z(218)], [mm(34.5), Z(237)], [0, Z(237)]], 24);
      m.revolucao(C, xr, yv, [[0, Z(183)], [mm(28), Z(183)], [mm(35.5), Z(195)], [mm(35.5), Z(206)], [mm(28), Z(218)], [0, Z(218)]], 24);
      m.revolucao(C, xr, yv, [[0, Z(157)], [mm(19), Z(157)], [mm(19), Z(183)], [0, Z(183)]]);
      m.revolucao(E, xr, yv, [[0, Z(138)], [mm(34.5), Z(138)], [mm(34.5), Z(157)], [0, Z(157)]], 24);
      m.revolucao(PR, xr, yv, [[0, Z(117)], [mm(14), Z(117)], [mm(14), Z(138)], [0, Z(138)]]);
      m.revolucao(B, xr, yv, [[0, Z(93)], [mm(13), Z(93)], [mm(13), Z(117)], [0, Z(117)]]);
      m.caixa(PR, xr - mm(22), xr + mm(22), yv - mm(37), yv - mm(33), Z(192), Z(209));
      m.tubo(E, [[xr, yv, Z(226)], [xr, Y(172), Z(226)]], mm(15), 10);
    }
    m.tubo(E, [[X(150), Y(172), Z(226)], [X(345), Y(172), Z(226)], [X(345), Y(172), Z(160)], [X(345), yp, Z(160)]], mm(16), 10);
    m.caixa(E, X(148), X(199), Y(115), Y(160), Z(43), Z(92));

    // base de concreto [RA]: sobe todo o equipamento por Base_acima (sem base, o equipamento fica no piso)
    var sobe = 0;
    if (q.Com_base) {
      sobe = q.Base_acima;
      m.transladar(0, 0, sobe);
      var cxb = 0.12, ex = q.Base_C / 0.86, ey = q.Base_L / 0.50;
      m.caixa("Concreto base", cxb + (-0.31 - cxb) * ex, cxb + (0.55 - cxb) * ex, -0.25 * ey, 0.25 * ey, sobe - q.Base_esp, sobe);
    }
    var portas = dryPortas(q);
    return { grupos: m.saida(false), portas: portas, avisos: avisos };
  }

  var PiscinaGeo = { piscina: piscina, dryPump: dryPump, portasPiscina: portasPiscina, portasDryPump: portasDryPump, recortePiscina: recortePiscina, padrao: PADRAO, _anel: anel, _orelhas: orelhas };
  global.PiscinaGeo = PiscinaGeo;
  if (typeof module !== "undefined" && module.exports) module.exports = PiscinaGeo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

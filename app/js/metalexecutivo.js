/* =====================================================================
 * metalexecutivo.js — JOGO DE PRANCHAS EXECUTIVAS da estrutura metálica
 * paramétrica (js/metalporticos.js — prioridade à tipologia "tesoura-leve";
 * vale para as tipologias do motor "livre", que entregam nós e barras).
 * Motor PURO, ES5, sem DOM. 1 clique → folhas no padrão RA (carimbo RA
 * intocado, penas/letra do Padrão de detalhamento, via js/acopranchas.js),
 * gravadas nas Folhas do BIM pelo js/metalfolhasbim.js (fiação fina na UI).
 *
 *   MetalExecutivo.gerar(M, opcoes) → { ok, folhas:[{ id, numero, titulo,
 *       formato, escala, svg }], avisos, conferencia }
 *   M      = MetalPorticos.modelo(tipo, par)  (ou { tipo, par } — o módulo monta)
 *   opcoes = as mesmas do AcoPranchas.gerar (empresa, obra, local, codigo,
 *            revisao, data, logo...) + calculo: { situacao, aprovado } (opcional)
 *
 * FOLHAS: 01 planta de montagem da cobertura · 02 elevações lateral e
 * frontal · 03 tesoura e coluna treliçada tipo (cotadas, com as marcas) ·
 * 04 detalhes das ligações (vistas recortadas do próprio modelo + balões
 * na vista mãe) · 05 base/chumbadores e seções dos perfis · 06 quadro de
 * materiais por conjunto e tabela de aço.
 *
 * ⚠ TUDO VEM DO MODELO: posição, comprimento, perfil e quantidade saem de
 *   M.nos / M.barras; medidas de seção saem do catálogo (MetalCriar.perfilCat).
 *   As LIGAÇÕES não são dimensionadas pelo cálculo da estrutura desenhada:
 *   cada detalhe sai com "LIGAÇÃO A DIMENSIONAR - NÃO VERIFICADA" em
 *   vermelho; a placa de base usa as dimensões de PARTIDA do
 *   js/metalligacao.js (placaBase: seção + 2 × 75 mm, t 25 mm, 4 chumbadores
 *   3/4" F1554-36, ancoragem 400 mm, graute 25 mm) com a nota de partida.
 *   O que o modelo não tem (calha) sai como PENDÊNCIA, nunca desenhado de
 *   cabeça.
 * Conferência: cada folha devolve as sobreposições texto × texto
 * (AcoPranchas.sobreposicoes) e texto × traço, e vista fora da área.
 * Teste: node tools/test-metalexecutivo.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function MPo() { return dep("MetalPorticos", "./metalporticos.js"); }
  function MC() { return global.MetalCriar || null; }
  function NR() { return dep("BimMetalNorma", "./metalnorma.js"); }

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v == null || v === "" || !isFinite(x) ? d : x; }
  function dois(k) { return ("0" + k).slice(-2); }
  function br(v, c) { c = c == null ? 2 : c; var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c); return s.replace(".", ","); }
  function mm(v) { return String(Math.round(v * 1000)); }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }
  function n3(v) { return String(Math.round(v * 1000) / 1000); }
  var VERM = "#c00000";
  var NOTA_LIG = "LIGAÇÃO A DIMENSIONAR - NÃO VERIFICADA";
  var NOTA_PARTIDA = "DIMENSÕES DE PARTIDA (js/metalligacao.js) - A DIMENSIONAR, NÃO VERIFICADO";
  var ESCALAS = [2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500];

  /* ================================================================ MARCAS das peças (o PADRAO_ACO.marcas + as da treliça leve) */
  var MARCAS = [
    [/^Banzo da coluna/, "BC", "COLUNA TRELIÇADA"], [/^Diagonal da coluna/, "DC", "COLUNA TRELIÇADA"], [/^Travejamento/, "TV", "COLUNA TRELIÇADA"],
    [/^Banzo superior/, "BS", "TESOURA"], [/^Banzo inferior/, "BI", "TESOURA"], [/^Montante/, "MT", "TESOURA"], [/^Diagonal/, "DG", "TESOURA"],
    [/^Pilar/, "P", "PÓRTICO"], [/^Viga/, "V", "PÓRTICO"],
    [/^Terça/, "TC", "TERÇAS E CORRENTES"], [/^Corrente/, "CR", "TERÇAS E CORRENTES"],
    [/^Escora da coluna/, "EC", "TRAVAMENTO"], [/^Escora/, "EB", "TRAVAMENTO"], [/^Mão-francesa/, "MF", "TRAVAMENTO"],
    [/^Contravento da coluna/, "CV", "CONTRAVENTAMENTO"], [/^Contravento da cobertura/, "CH", "CONTRAVENTAMENTO"], [/^Contravento vertical/, "CVT", "CONTRAVENTAMENTO"], [/^Contravento/, "CV", "CONTRAVENTAMENTO"],
    [/^Coluna de tapamento/, "CT", "TAPAMENTO"], [/^Travessa/, "TL", "TAPAMENTO"]
  ];
  function marcaDe(papel) { for (var i = 0; i < MARCAS.length; i++) if (MARCAS[i][0].test(txt(papel))) return { m: MARCAS[i][1], conj: MARCAS[i][2] }; return { m: "X", conj: "OUTROS" }; }
  /* 22/11/2026: o aço do tubo com costura passou a "NBR 8261 Gr A (quadrado/retangular)" (deb9112a) e estourava a coluna AÇO
     do quadro (36 mm), cruzando a linha da tabela. Só a ESCRITA na folha encurta; norma e grau seguem inteiros. */
  function curto(nome) { return txt(nome).replace(/\s*\(serie pol\)/i, "").replace(/\s+(Gerdau|ArcelorMittal|Usiminas|VMB|Tuper|AISC)\b.*$/i, "").replace(/\s*\(quadrado\/retangular\)/i, " (ret.)").replace(/\s*\(circular\)/i, " (circ.)").trim(); }

  /* ================================================================ SEÇÃO (catálogo) → medidas e massa */
  var _sec = {};
  function secao(cat) {
    if (_sec[cat]) return _sec[cat];
    var q = null; try { q = MC() && MC().perfilCat(cat); } catch (e) { q = null; }
    var P = null; try { P = q && global.PerfisAco && global.PerfisAco.paraPerfil ? global.PerfisAco.paraPerfil(q) : null; } catch (e2) { P = null; }
    var s = { cat: cat, forma: P ? P.forma : "?", alt: 0.05, larg: 0.05, A: 0, P: P };
    if (P) {
      if (P.forma === "frio") { s.alt = P.bw; s.larg = P.bf; s.A = P.t * (P.bw + 2 * P.bf - 2 * P.t); }
      else if (P.forma === "L") { s.alt = P.a; s.larg = P.b; s.A = P.t * (P.a + P.b - P.t); }
      else if (P.forma === "tubo-ret") { s.alt = P.h; s.larg = P.b; s.A = 2 * P.t * (P.b + P.h - 2 * P.t); }
      else if (P.forma === "circ") { s.alt = P.d; s.larg = P.d; s.A = Math.PI * P.d * P.d / 4; }
      else if (P.d && P.bf) { s.alt = P.d; s.larg = P.bf; s.A = num(P.A, 0); }
    }
    s.kgm = s.A * 7850;
    _sec[cat] = s; return s;
  }

  /* ================================================================ O MODELO → peças com geometria */
  function preparar(M) {
    var pecas = arr(M.barras).map(function (b) {
      var A = M.nos[b.a], B = M.nos[b.b]; if (!A || !B) return null;
      var cat = b.cat || (b.perfil && (b.perfil.nome || b.perfil.cat)) || "PERFIL VARIÁVEL (MÍSULA)", mk = marcaDe(b.papel), s = secao(cat);
      return { b: b, A: A, B: B, L: Math.sqrt(Math.pow(A[0] - B[0], 2) + Math.pow(A[1] - B[1], 2) + Math.pow(A[2] - B[2], 2)), marca: mk.m, conj: mk.conj, s: s, grupo: b.grupo, papel: b.papel, cat: cat, aco: b.aco };
    }).filter(Boolean);
    var xs = [], ys = [], zs = [];
    pecas.forEach(function (p) { [p.A, p.B].forEach(function (q) { xs.push(q[0]); ys.push(q[1]); zs.push(q[2]); }); });
    function mn(a) { return Math.min.apply(null, a); } function mx(a) { return Math.max.apply(null, a); }
    var par = M.par || {}, nP = num(par.nPorticos, 0), esp = num(par.espacamento, 0);
    var zP = []; for (var i = 0; i < nP; i++) zP.push(num(par.z0, 0) + (Array.isArray(par.posicoes) && par.posicoes.length === nP ? num(par.posicoes[i], 0) : i * esp));
    var vao0 = num(par.vao, mx(xs) - mn(xs)), ex0 = num(par.x0, 0);
    return { M: M, par: par, pecas: pecas, ex0: ex0, ex1: ex0 + vao0, x0: mn(xs), x1: mx(xs), y0: mn(ys), y1: mx(ys), z0: mn(zs), z1: mx(zs), zP: zP, vao: num(par.vao, mx(xs) - mn(xs)), pe: num(par.peDireito, 0) };
  }
  /* pórtico TIPO: o 2º (interno) quando há 3 ou mais; as peças no plano z dele */
  function porticoTipo(d) {
    var k = d.zP.length >= 3 ? 1 : 0, z = d.zP[k] != null ? d.zP[k] : d.z0;
    var pc = d.pecas.filter(function (p) { return Math.abs(p.A[2] - z) < 1e-4 && Math.abs(p.B[2] - z) < 1e-4 && p.b.portico === k + 1; });
    return { k: k, z: z, pecas: pc };
  }

  /* ================================================================ VISTA (projeção ortogonal, papel em mm, y para baixo) */
  function Vista(u, v, cx0, cy1, esc, ox, oy) { this.u = u; this.v = v; this.s = 1000 / esc; this.esc = esc; this.cx0 = cx0; this.cy1 = cy1; this.ox = ox; this.oy = oy; }
  Vista.prototype.p = function (P) { return [this.ox + (this.u(P) - this.cx0) * this.s, this.oy + (this.cy1 - this.v(P)) * this.s]; };
  Vista.prototype.uv = function (uu, vv) { return [this.ox + (uu - this.cx0) * this.s, this.oy + (this.cy1 - vv) * this.s]; };
  function escolherEscala(wm, hm, wBox, hBox, min) {
    for (var i = 0; i < ESCALAS.length; i++) { var e = ESCALAS[i]; if (e < (min || 1)) continue; if (wm * 1000 / e <= wBox && hm * 1000 / e <= hBox) return e; }
    return ESCALAS[ESCALAS.length - 1];
  }

  /* polígono recortado num retângulo [x0,y0,x1,y1] (Sutherland–Hodgman) */
  function recorta(poly, R) {
    var out = poly;
    [[0, R[0], 1], [0, R[2], -1], [1, R[1], 1], [1, R[3], -1]].forEach(function (c) {
      var inp = out; out = []; if (!inp.length) return;
      function dentro(p) { return (p[c[0]] - c[1]) * c[2] >= -1e-9; }
      function corte(a, b) { var t = (c[1] - a[c[0]]) / (b[c[0]] - a[c[0]]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
      for (var i = 0; i < inp.length; i++) {
        var a = inp[i], b = inp[(i + 1) % inp.length];
        if (dentro(b)) { if (!dentro(a)) out.push(corte(a, b)); out.push(b); } else if (dentro(a)) out.push(corte(a, b));
      }
    });
    return out;
  }
  /* segmento recortado no retângulo (Liang–Barsky) → [p, q] ou null */
  function segClip(a, b, R) {
    var t0 = 0, t1 = 1, dx = b[0] - a[0], dy = b[1] - a[1], pp = [-dx, dx, -dy, dy], qq = [a[0] - R[0], R[2] - a[0], a[1] - R[1], R[3] - a[1]];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(pp[i]) < 1e-12) { if (qq[i] < 0) return null; continue; }
      var t = qq[i] / pp[i]; if (pp[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return t1 - t0 > 1e-9 ? [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]] : null;
  }
  function polyStr(P) { return P.map(function (q) { return n3(q[0]) + "," + n3(q[1]); }).join(" "); }
  /* desenha a PEÇA do modelo: faixa com a largura real do perfil na escala (fundo branco: a corda cobre o fim da diagonal);
     fina demais → uma linha na pena da camada */
  function faixa(D, a, b, wPapel, cam, o) {
    o = o || {};
    var L = hip(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) return;
    var ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy * wPapel / 2, ny = ux * wPapel / 2;
    if (wPapel < 0.6) {
      if (o.recorte) { var c = segClip(a, b, o.recorte); if (!c) return; a = c[0]; b = c[1]; }
      D.linha(a[0], a[1], b[0], b[1], cam); return;
    }
    var P = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
    if (o.recorte) { P = recorta(P, o.recorte); if (P.length < 3) return; }
    D.traco(P, true);
    D.add('<polygon points="' + polyStr(P) + '" fill="' + (o.cheio ? "#000" : "#fff") + '"' + D.estilo(cam) + "/>");
  }
  function camDe(p) {
    if (/^(banzoColuna|banzoSup|banzoInf|pilar|viga)$/.test(p.grupo)) return "MET-PRINCIPAL";
    if (/^(contravento|corrente|maoFrancesa)$/.test(p.grupo)) return "MET-CONTRAVENTO";
    return "MET-PERFIL";
  }
  function ordem(p) { return /^(banzoColuna|banzoSup|banzoInf|pilar|viga)$/.test(p.grupo) ? 2 : (/^(terca|escora|tapamento)$/.test(p.grupo) ? 1 : 0); }
  /* desenha um conjunto de peças numa vista; lado "alt" = a dimensão no plano da vista (elevação), "larg" = vista de cima */
  function desenharPecas(D, V, pecas, o) {
    o = o || {};
    pecas.slice().sort(function (a, b) { return ordem(a) - ordem(b); }).forEach(function (p) {
      /* justificação "base" (terça apoiada): o eixo do modelo é a face de baixo — em elevação a peça sobe meia altura */
      var dy = o.lado !== "larg" && p.b.just === "base" ? p.s.alt / 2 : 0;
      var a = V.p(dy ? [p.A[0], p.A[1] + dy, p.A[2]] : p.A), b = V.p(dy ? [p.B[0], p.B[1] + dy, p.B[2]] : p.B), w = (o.lado === "larg" ? p.s.larg : p.s.alt) * V.s;
      if (hip(b[0] - a[0], b[1] - a[1]) < 0.05) {   /* peça de ponta para a vista (terça na elevação frontal, coluna na planta): a seção */
        if (o.semPonta) return;
        var hw = p.s.larg * V.s / 2, hh = p.s.alt * V.s / 2; hw = Math.max(hw, 0.35); hh = Math.max(hh, 0.35);
        var R = [[a[0] - hw, a[1] - hh], [a[0] + hw, a[1] - hh], [a[0] + hw, a[1] + hh], [a[0] - hw, a[1] + hh]];
        if (o.recorte) { R = recorta(R, o.recorte); if (R.length < 3) return; }
        D.cheio(R, "#000"); return;
      }
      faixa(D, a, b, o.fino && o.fino(p) ? 0 : w, o.cam ? o.cam(p) : camDe(p), { recorte: o.recorte });
    });
  }
  function caixaPecas(pecas, u, v) {
    var b = [1e9, 1e9, -1e9, -1e9];
    pecas.forEach(function (p) { [p.A, p.B].forEach(function (q) { var uu = u(q), vv = v(q); if (uu < b[0]) b[0] = uu; if (uu > b[2]) b[2] = uu; if (vv < b[1]) b[1] = vv; if (vv > b[3]) b[3] = vv; }); });
    return b;
  }
  function uZ(P) { return P[2]; } function uX(P) { return P[0]; } function vY(P) { return P[1]; } function vX(P) { return P[0]; }

  /* rótulo de marca com chamada, no primeiro lugar livre em volta (o texto nunca cai em cima de peça ou texto) */
  function rotular(D, px, py, linhas, area, o) {
    o = o || {}; var h = D.E.T.nota, AP0 = AP(), w = 0;
    linhas.forEach(function (l) { w = Math.max(w, AP0.largTexto(txt(l.t || l), h)); });
    var hT = linhas.length * h * 1.45 + 1, cands = (o.cands || []).slice(), ds = o.dist || [10, 16, 24, 34, 46];
    ds.forEach(function (dd) { [[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1.4], [0, 1.4], [1.4, 0], [-1.4, 0]].forEach(function (k) { cands.push([px + k[0] * dd, py + k[1] * dd * 0.8, k[0] >= 0 ? 1 : -1]); }); });
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i], dr = c[2], bx = [dr > 0 ? c[0] : c[0] - w - 1.6, c[1] - 0.9 - hT, dr > 0 ? c[0] + w + 1.6 : c[0], c[1] + 0.3];
      if (area && (bx[0] < area[0] || bx[2] > area[2] || bx[1] < area[1] || bx[3] > area[3])) continue;
      if (!D.livre(bx, 0.6) || D.cortaTexto(px, py, c[0], c[1])) continue;
      D.chamada(px, py, c[0], c[1], linhas, { dir: dr, h: h });
      return true;
    }
    /* sem lugar nas posições de partida: procura a caixa livre mais perto (janela de 70 mm em volta) */
    var wb = w + 1.6, hb = hT + 1.2, R = o.janela || 110;
    var jan = [px - R, py - R, px + R, py + R]; if (area) jan = [Math.max(jan[0], area[0]), Math.max(jan[1], area[1]), Math.min(jan[2], area[2]), Math.min(jan[3], area[3])];
    var best = null, bd = 1e18;
    for (var yy = jan[1] + hb / 2; yy <= jan[3] - hb / 2; yy += 1.5) for (var xx = jan[0] + wb / 2; xx <= jan[2] - wb / 2; xx += 1.5) {
      var dd = (xx - px) * (xx - px) + (yy - py) * (yy - py); if (dd >= bd || dd < 36) continue;
      if (!D.livre([xx - wb / 2, yy - hb / 2, xx + wb / 2, yy + hb / 2], 0.6)) continue;
      var dr2 = xx - wb / 2 >= px - 0.5 ? 1 : (xx + wb / 2 <= px + 0.5 ? -1 : 0); if (!dr2) continue;   /* a chamada chega pela ponta do patamar: o texto todo de um lado só, senão a linha cruza o texto */
      var tx = dr2 > 0 ? xx - wb / 2 : xx + wb / 2, ty = yy + hb / 2 - 0.3;
      if (D.cortaTexto(px, py, tx, ty)) continue;
      bd = dd; best = [tx, ty, dr2];
    }
    if (best) { D.chamada(px, py, best[0], best[1], linhas, { dir: best[2], h: h }); return true; }
    (D.semLugar = D.semLugar || []).push(linhas.map(function (l) { return txt(l.t || l); }).join(" / "));
    return false;
  }
  function meio(D, V, p) { var a = V.p(p.A), b = V.p(p.B); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }

  /* ================================================================ FOLHA 01 — PLANTA DE MONTAGEM DA COBERTURA */
  function noTelhado(d, p) { return Math.min(p.A[1], p.B[1]) >= d.pe - 1e-3 && !/^(banzoColuna|travejamento|tapamento)$/.test(p.grupo) && !/coluna|vertical/i.test(p.papel); }
  function folhaPlanta(c) {
    var D = c.D, d = c.d, A = c.geo.area, OVp = 36;
    var Lz = d.z1 - d.z0, Lx = d.x1 - d.x0;
    var hLeg = 70, esc = escolherEscala(Lz, Lx, A.w - 2 * OVp - 10, A.h - 2 * OVp - hLeg - 20, 50);
    var s = 1000 / esc, wP = Lz * s, hP = Lx * s, ox = A.x + (A.w - wP) / 2, oy = A.y + OVp + 14;
    var V = new Vista(uZ, vX, d.z0, d.x1, esc, ox, oy);
    c.ocupa(ox - OVp, oy - OVp, wP + 2 * OVp, hP + 2 * OVp);
    tituloEm(c, ox - OVp, oy - OVp - 12, "PLANTA DE MONTAGEM DA COBERTURA", "ESCALA 1:" + esc, null);
    var tel = d.pecas.filter(function (p) { return noTelhado(d, p); });
    var oc = tel.filter(function (p) { return /^(banzoInf|escora)$/.test(p.grupo) && /inferior/i.test(p.papel + " " + p.grupo); });
    var vis = tel.filter(function (p) { return oc.indexOf(p) < 0 && (p.grupo !== "montante" && p.grupo !== "diagonal" && p.grupo !== "maoFrancesa"); });
    desenharPecas(D, V, oc, { lado: "larg", cam: function () { return "MET-OCULTA"; }, semPonta: true });
    desenharPecas(D, V, vis, { lado: "larg", semPonta: true });
    /* colunas: a seção dos banzos na base (cheia) */
    var bases = d.pecas.filter(function (p) { return p.grupo === "banzoColuna" || p.grupo === "pilar" || p.grupo === "tapamento"; });
    bases.forEach(function (p) { var q = p.A[1] < p.B[1] ? p.A : p.B, a = V.p(q), hw = Math.max(p.s.alt * s / 2, 0.4), hh = Math.max(p.s.larg * s / 2, 0.4); D.cheio([[a[0] - hw, a[1] - hh], [a[0] + hw, a[1] - hh], [a[0] + hw, a[1] + hh], [a[0] - hw, a[1] + hh]]); });
    /* eixos */
    var T = D.E.T;
    d.zP.forEach(function (z, i) {
      var a = V.uv(z, d.ex1), b = V.uv(z, d.ex0);
      D.linha(a[0], a[1] - 30, b[0], b[1] + 30, "MET-EIXO");
      D.balao(a[0], a[1] - 30 - D.raioBalao(String(i + 1)), String(i + 1)); D.balao(b[0], b[1] + 30 + D.raioBalao(String(i + 1)), String(i + 1));
    });
    [[d.ex0, "A"], [d.ex1, "B"]].forEach(function (q) {
      var a = V.uv(d.z0, q[0]), b = V.uv(d.z1, q[0]);
      D.linha(a[0] - 30, a[1], b[0] + 30, b[1], "MET-EIXO");
      D.balao(a[0] - 30 - D.raioBalao(q[1]), a[1], q[1]); D.balao(b[0] + 30 + D.raioBalao(q[1]), b[1], q[1]);
    });
    /* cotas: entre-eixos e total (em cima), vão e terças (à esquerda) */
    var top = d.zP.map(function (z) { return V.uv(z, d.ex1); });
    if (top.length > 1) {
      D.cadeia(top, 10, top.slice(1).map(function (q, i) { return mm(d.zP[i + 1] - d.zP[i]); }), { evitar: [] });
      D.cota(top[0][0], top[0][1], top[top.length - 1][0], top[top.length - 1][1], 18, mm(d.zP[d.zP.length - 1] - d.zP[0]), { evitar: top });
    }
    var xs = {}; tel.filter(function (p) { return p.grupo === "terca"; }).forEach(function (p) { xs[Math.round(p.A[0] * 1000)] = 1; });
    var xt = Object.keys(xs).map(Number).sort(function (a, b) { return a - b; });
    xt = xt.filter(function (x) { return x > d.ex0 * 1000 + 1 && x < d.ex1 * 1000 - 1; });
    var esq = [V.uv(d.z0, d.ex0)].concat(xt.map(function (x) { return V.uv(d.z0, x / 1000); })).concat([V.uv(d.z0, d.ex1)]);
    var vx = [Math.round(d.ex0 * 1000)].concat(xt).concat([Math.round(d.ex1 * 1000)]);
    var Pe = [], ve = []; esq.forEach(function (p, i) { if (i && Math.abs(vx[i] - vx[i - 1]) < 1) return; Pe.push(p); if (i) ve.push(String(Math.round(vx[i] - vx[i - 1 - (Pe.length - 1 === i ? 0 : 0)]))); });
    /* refaz os valores pelos pontos que ficaram */
    var vxs = []; esq.forEach(function (p, i) { if (i && Math.abs(vx[i] - vx[i - 1]) < 1) return; vxs.push(vx[i]); });
    ve = vxs.slice(1).map(function (v, i) { return String(Math.round(v - vxs[i])); });
    D.cadeia(Pe.slice().reverse(), -10, ve.slice().reverse(), {});
    D.cota(Pe[0][0], Pe[0][1], Pe[Pe.length - 1][0], Pe[Pe.length - 1][1], 18, mm(d.ex1 - d.ex0));
    /* caimento */
    var ym = (V.uv(d.z0, d.x0)[1] + V.uv(d.z0, d.x1)[1]) / 2, xc = ox + wP * 0.5;
    var cum = V.uv(d.z0, (d.x0 + d.x1) / 2)[1];
    if (num(d.par.aguas, 2) === 2) {
      D.linha(ox, cum, ox + wP, cum, "MET-FINA", ' stroke-dasharray="6 1.5 1 1.5"');
    }
    /* marcas (uma por papel) e balões de detalhe */
    var area = [A.x + 2, A.y + 2, A.x + A.w - 2, A.y + A.h - hLeg - 10];
    /* a malha da cobertura é fechada (terças × correntes): as marcas saem numa fileira ABAIXO da planta, com chamada até a peça */
    var marcas = [], vistos = {}, todas = vis.concat(oc);
    todas.forEach(function (p) { var k = p.marca + "|" + p.cat; if (!vistos[k]) { vistos[k] = 1; marcas.push(p); } });
    var yLab = V.uv(d.z0, d.ex0)[1] + 50;
    marcas.forEach(function (p, i) {
      var zt = d.z0 + (i + 0.5) / marcas.length * (d.z1 - d.z0);
      var lista = todas.filter(function (q) { return q.marca === p.marca && q.cat === p.cat; });
      var rep = lista.reduce(function (m, q) { var f = function (r) { return Math.abs((r.A[2] + r.B[2]) / 2 - zt) + 0.8 * (Math.min(r.A[0], r.B[0]) - d.ex0); }; return f(q) < f(m) ? q : m; }, lista[0]);
      var a0 = V.p(rep.A), b0 = V.p(rep.B), m = a0[1] > b0[1] ? [a0[0] * 0.7 + b0[0] * 0.3, a0[1] * 0.7 + b0[1] * 0.3] : [a0[0] * 0.3 + b0[0] * 0.7, a0[1] * 0.3 + b0[1] * 0.7];
      if (hip(a0[0] - b0[0], a0[1] - b0[1]) < 1) m = a0;
      var ty = yLab + (i % 2) * 9;
      if (!rotular(D, m[0], m[1], [p.marca + " - " + curto(p.cat)], area, { cands: [[m[0] + 3, ty, 1], [m[0] - 3, ty, -1], [m[0] + 3, ty + 18, 1], [m[0] - 3, ty + 18, -1], [m[0] + 3, ty + 27, 1], [m[0] + 40, ty + 36, 1], [m[0] - 40, ty + 36, -1], [m[0] + 80, ty + 45, 1], [m[0] - 80, ty + 45, -1]] })) rotular(D, m[0], m[1], [p.marca + " - " + curto(p.cat)], area, { janela: 120 });
    });
    var cv = vis.filter(function (p) { return p.grupo === "contravento"; })[0];
    if (cv) { var mc = V.p(cv.A); c.balaoLig(mc[0], mc[1], 5, area); }
    var tc = vis.filter(function (p) { return p.grupo === "terca"; })[2];
    if (tc) { var mt = meio(D, V, tc); c.balaoLig(mt[0], mt[1], 4, area); }
    /* legenda das peças da planta */
    var lin = [], ja = {};
    vis.concat(oc).forEach(function (p) { var k = p.marca + "|" + p.cat; if (ja[k]) return; ja[k] = 1; lin.push([p.marca, txt(p.papel).toUpperCase() + (oc.indexOf(p) >= 0 ? " (ABAIXO, TRACEJADO)" : ""), curto(p.cat)]); });
    var cols = [{ t: "MARCA", w: 18 }, { t: "PEÇA", w: 92, al: "E" }, { t: "PERFIL", w: 62, al: "E" }];
    var tx = A.x + 6, ty = A.y + A.h - (lin.length + 1) * 4.6 - 14;
    D.texto(tx, ty - 3, "LEGENDA", T.titulo * 0.8, { peso: 0.16 });
    var tb = D.tabela(tx, ty, cols, lin, {});
    c.ocupa(tx, ty - 8, tb.w, tb.h + 8);
    return { escala: "1:" + esc };
  }

  /* ================================================================ FOLHA 02 — ELEVAÇÕES */
  function folhaElevacoes(c) {
    var D = c.D, d = c.d, A = c.geo.area, OVp = 30;
    /* lateral: a metade de perto; o que está no plano do telhado (correntes, mãos-francesas, contravento da cobertura) fica na planta */
    var lat = d.pecas.filter(function (p) { return Math.max(p.A[0], p.B[0]) <= (d.x0 + d.x1) / 2 + 1e-3 && !/^(corrente|maoFrancesa)$/.test(p.grupo) && !/cobertura/i.test(p.papel); });
    var fro = d.pecas.filter(function (p) { return Math.max(p.A[2], p.B[2]) <= d.z0 + 1e-3; });
    var H = d.y1 - d.y0, Lz = d.z1 - d.z0, Lx = d.x1 - d.x0;
    var hBox = (A.h - 4 * OVp - 40) / 2, esc = Math.max(escolherEscala(Lz, H, A.w - 2 * OVp - 30, hBox, 50), escolherEscala(Lx, H, A.w - 2 * OVp - 30, hBox, 50));
    var s = 1000 / esc;
    function vista(pecas, u, u0, u1, titulo, y0) {
      var w = (u1 - u0) * s, h = H * s, ox = A.x + (A.w - w) / 2, oy = y0 + 18;
      var V = new Vista(u, vY, u0, d.y1, esc, ox, oy);
      c.ocupa(ox - OVp, y0, w + 2 * OVp, h + 18 + OVp);
      tituloEm(c, ox - OVp, y0, titulo, "ESCALA 1:" + esc, null);
      desenharPecas(D, V, pecas, { lado: "alt", fino: function (p) { return u === uZ && p.grupo === "terca"; } });   /* terças em linha na lateral: são 7 sobrepostas */
      var g0 = V.uv(u0, d.y0), g1 = V.uv(u1, d.y0);
      D.linha(g0[0] - 8, g0[1], g1[0] + 8, g1[1], "MET-CONTEXTO");
      D.nivel(g1[0] + 12, g1[1], "+-0,00", 1);
      var ye = V.uv(u1, d.pe); D.nivel(g1[0] + 12, ye[1], "+" + br(d.pe, 2), 1);
      var yc = V.uv(u1, d.y1); D.nivel(g1[0] + 12, yc[1], "+" + br(d.y1, 2), 1);
      return V;
    }
    var V1 = vista(lat, uZ, d.z0, d.z1, "ELEVAÇÃO LATERAL (FILA A)", A.y + 4);
    var V2 = vista(fro, uX, d.x0, d.x1, "ELEVAÇÃO FRONTAL (EIXO 1)", A.y + 4 + (A.h) / 2);
    /* cotas: entre-eixos na lateral, vão na frontal; alturas */
    var base1 = d.zP.map(function (z) { return V1.uv(z, d.y0); });
    if (base1.length > 1) D.cadeia(base1, -10, base1.slice(1).map(function (q, i) { return mm(d.zP[i + 1] - d.zP[i]); }), {});
    var b2 = [V2.uv(d.ex0, d.y0), V2.uv(d.ex1, d.y0)]; D.cota(b2[0][0], b2[0][1], b2[1][0], b2[1][1], -10, mm(d.ex1 - d.ex0));
    [V1, V2].forEach(function (V, i) {
      var u0 = i ? d.x0 : d.z0, P = [V.uv(u0, d.y0), V.uv(u0, d.pe), V.uv(u0, d.y1)];
      D.cadeia(P, 12, [mm(d.pe - d.y0), mm(d.y1 - d.pe)], {});
    });
    var area = [A.x + 2, A.y + 2, A.x + A.w - 2, A.y + A.h - 2], vistos = {};
    [[lat, V1], [fro, V2]].forEach(function (q) {
      vistos = {};
      q[0].forEach(function (p) {
        if (vistos[p.marca]) return; var a = q[1].p(p.A), b = q[1].p(p.B); if (hip(a[0] - b[0], a[1] - b[1]) < 3) return; vistos[p.marca] = 1;
        var m = meio(D, q[1], p); rotular(D, m[0], m[1], [p.marca + " - " + curto(p.cat)], area);
      });
    });
    return { escala: "1:" + esc };
  }

  /* ================================================================ FOLHA 03 — PÓRTICO, TESOURA E COLUNA TIPO */
  function folhaTipo(c) {
    var D = c.D, d = c.d, A = c.geo.area, pt = porticoTipo(d), pc = pt.pecas, OVp = 28;
    if (!pc.length) { D.texto(A.x + 10, A.y + 20, "SEM PÓRTICO TIPO NO MODELO", D.E.T.titulo, { cor: VERM }); return {}; }
    var bx = caixaPecas(pc, uX, vY), H = bx[3] - bx[1], W = bx[2] - bx[0];
    /* 1) pórtico inteiro */
    var e1 = escolherEscala(W, H, A.w - 2 * OVp, A.h * 0.36, 50), s1 = 1000 / e1;
    var ox = A.x + (A.w - W * s1) / 2, oy = A.y + 18, V1 = new Vista(uX, vY, bx[0], bx[3], e1, ox, oy);
    c.ocupa(ox - OVp, A.y, W * s1 + 2 * OVp, H * s1 + 18 + OVp);
    tituloEm(c, ox - OVp, A.y, "PÓRTICO TIPO (EIXO " + (pt.k + 1) + ")", "ESCALA 1:" + e1, null);
    desenharPecas(D, V1, pc, { lado: "alt" });
    var bb = [V1.uv(bx[0], bx[1]), V1.uv(bx[2], bx[1])]; D.cota(bb[0][0], bb[0][1], bb[1][0], bb[1][1], -10, mm(W));
    D.cadeia([V1.uv(bx[0], bx[1]), V1.uv(bx[0], d.pe), V1.uv(bx[0], bx[3])], 10, [mm(d.pe - bx[1]), mm(bx[3] - d.pe)], {});
    var yBase = oy + H * s1 + OVp + 6;
    /* nós de referência (geometria, não nome): joelho, cumeeira, nó do banzo superior, base */
    var bs = pc.filter(function (p) { return p.grupo === "banzoSup" || p.grupo === "viga"; });
    var bc = pc.filter(function (p) { return p.grupo === "banzoColuna" || p.grupo === "pilar"; });
    var ref = refs(d, pc);
    var areaTop = [A.x + 2, A.y + 2, A.x + A.w - 2, yBase - 4];
    if (ref.joelho) { var j = V1.p(ref.joelho); c.balaoLig(j[0], j[1], 2, areaTop); }
    if (ref.cumeeira) { var q = V1.p(ref.cumeeira); c.balaoLig(q[0], q[1], 3, areaTop); }
    if (ref.noBanzo) { var nb = V1.p(ref.noBanzo); c.balaoLig(nb[0], nb[1], 1, areaTop); }
    if (ref.base) { var ba = V1.p(ref.base); c.balaoLig(ba[0], ba[1], 7, areaTop, c.folhaBase); }
    /* 2) meia tesoura ampliada (x até a cumeeira; de baixo do banzo inferior para cima) */
    var temTes = pc.some(function (p) { return p.grupo === "banzoInf"; });
    var wCol = 0;
    var colP = pc.filter(function (p) { return Math.max(p.A[0], p.B[0]) <= bx[0] + num(d.par.larguraColuna, 0) + 1e-3 && Math.max(p.A[1], p.B[1]) <= d.pe + 1e-3; });
    var colB = caixaPecas(colP, uX, vY);
    var hRest = A.y + A.h - yBase - 4;
    var e3 = colP.length ? escolherEscala(colB[2] - colB[0] + 0.1, colB[3] - colB[1], 120, hRest - OVp - 28, 10) : 0;
    if (colP.length) wCol = (colB[2] - colB[0]) * 1000 / e3 + 2 * OVp + 60;
    if (temTes) {
      var xm = (bx[0] + bx[2]) / 2, bi = pc.filter(function (p) { return p.grupo === "banzoInf"; });
      var yInf = Math.min.apply(null, bi.map(function (p) { return Math.min(p.A[1], p.B[1]); }));
      var meiaP = pc.filter(function (p) { return Math.max(p.A[0], p.B[0]) <= xm + 1e-3 && Math.min(p.A[1], p.B[1]) >= yInf - 0.4 - 1e-3; });
      var mb = caixaPecas(meiaP, uX, vY), e2 = escolherEscala(mb[2] - mb[0], mb[3] - mb[1], A.w - wCol - 2 * OVp - 10, hRest - 2 * OVp - 20, 10), s2 = 1000 / e2;
      var ox2 = A.x + OVp + 4, oy2 = yBase + 18 + OVp - 10, V2 = new Vista(uX, vY, mb[0], mb[3], e2, ox2, oy2);
      c.ocupa(A.x, yBase, (mb[2] - mb[0]) * s2 + 2 * OVp + 4, (mb[3] - mb[1]) * s2 + 18 + 2 * OVp);
      tituloEm(c, A.x + 4, yBase, "TESOURA TIPO - MEIA TESOURA (SIMÉTRICA)", "ESCALA 1:" + e2, null);
      desenharPecas(D, V2, meiaP, { lado: "alt" });
      /* painéis: os nós do banzo inferior */
      var xsI = {}; pc.filter(function (p) { return p.grupo === "montante"; }).forEach(function (p) { var q = p.A[1] < p.B[1] ? p.A : p.B; if (q[0] <= xm + 1e-3) xsI[Math.round(q[0] * 1000)] = 1; });
      bi.forEach(function (p) { [p.A, p.B].forEach(function (q) { if (q[0] <= xm + 1e-3) xsI[Math.round(q[0] * 1000)] = 1; }); });
      var kx = Object.keys(xsI).map(Number).sort(function (a, b) { return a - b; });
      var Pp = kx.map(function (x) { return V2.uv(x / 1000, mb[1]); });
      if (Pp.length > 1) D.cadeia(Pp, -10, Pp.slice(1).map(function (q, i) { return String(kx[i + 1] - kx[i]); }), {});
      D.cota(V2.uv(mb[0], mb[1])[0], V2.uv(mb[0], mb[1])[1], V2.uv(xm, mb[1])[0], V2.uv(xm, mb[1])[1], -18, mm(xm - mb[0]));
      /* altura da tesoura (no montante da cumeeira) e inclinação */
      var at = num(d.par.alturaTrelica, 0);
      if (ref.cumeeira && at > 0) { var t0 = V2.p(ref.cumeeira), t1 = V2.uv(ref.cumeeira[0], ref.cumeeira[1] - at); D.cota(t1[0], t1[1], t0[0], t0[1], -10, mm(at)); }
      var inc = num(d.par.inclinacao, 0), ang = Math.atan(inc / 100) * 180 / Math.PI;
      var bs1 = bs.filter(function (p) { return Math.max(p.A[0], p.B[0]) <= xm + 1e-3; });
      if (bs1.length) {
        var Ls = bs1.reduce(function (s0, p) { return s0 + p.L; }, 0), q0 = bs1[Math.floor(bs1.length / 2)], mq = meio(D, V2, q0);
        rotular(D, mq[0], mq[1], ["INCLINAÇÃO " + br(inc, 0) + "% (" + br(ang, 2) + " GRAUS)", "BANZO SUPERIOR: COMPRIMENTO " + mm(Ls) + " (MEIA TESOURA)"], [A.x + 2, yBase + 4, A.x + A.w - wCol, A.y + A.h - 2]);
      }
      var vist = {}, areaM = [A.x + 2, yBase + 4, A.x + A.w - wCol, A.y + A.h - 2];
      meiaP.forEach(function (p) { if (vist[p.marca]) return; vist[p.marca] = 1; var m = meio(D, V2, p); rotular(D, m[0], m[1], [p.marca + " - " + curto(p.cat)], areaM); });
      if (ref.noBanzo) { var nb2 = V2.p(ref.noBanzo); c.balaoLig(nb2[0], nb2[1], 1, areaM); }
      if (ref.cumeeira) { var cm2 = V2.p(ref.cumeeira); c.balaoLig(cm2[0], cm2[1], 3, areaM); }
      var tc = d.pecas.filter(function (p) { return p.grupo === "terca"; });
      if (tc.length) c.avisoDet = true;
    }
    /* 3) coluna treliçada */
    if (colP.length) {
      var s3 = 1000 / e3, wc = (colB[2] - colB[0]) * s3, hc = (colB[3] - colB[1]) * s3;
      var ox3 = A.x + A.w - wCol + OVp + 30, oy3 = yBase + 20, V3 = new Vista(uX, vY, colB[0], colB[3], e3, ox3, oy3);
      c.ocupa(A.x + A.w - wCol, yBase, wCol, hc + 20 + OVp);
      tituloEm(c, A.x + A.w - wCol + 4, yBase, "COLUNA TRELIÇADA TIPO", "ESCALA 1:" + e3, null);
      desenharPecas(D, V3, colP, { lado: "alt" });
      var ys = {}; colP.filter(function (p) { return p.grupo === "travejamento" || p.grupo === "banzoColuna"; }).forEach(function (p) { [p.A, p.B].forEach(function (q) { if (Math.abs(q[0] - colB[0]) < 1e-3) ys[Math.round(q[1] * 1000)] = 1; }); });
      var ky = Object.keys(ys).map(Number).sort(function (a, b) { return a - b; });
      var Py = ky.map(function (y) { return V3.uv(colB[0], y / 1000); });
      if (Py.length > 1) D.cadeia(Py, 10, Py.slice(1).map(function (q, i) { return String(ky[i + 1] - ky[i]); }), {});
      D.cota(V3.uv(colB[0], colB[1])[0], V3.uv(colB[0], colB[1])[1], V3.uv(colB[0], colB[3])[0], V3.uv(colB[0], colB[3])[1], 22, mm(colB[3] - colB[1]));
      var lc = num(d.par.larguraColuna, 0);
      if (lc > 0) D.cota(V3.uv(colB[0], colB[1])[0], V3.uv(colB[0], colB[1])[1], V3.uv(colB[0] + lc, colB[1])[0], V3.uv(colB[0] + lc, colB[1])[1], -8, mm(lc), { foraSeUnico: true });
      var vc = {}, areaC = [A.x + A.w - wCol + 2, yBase + 4, A.x + A.w - 2, A.y + A.h - 2];
      colP.forEach(function (p) { if (vc[p.marca]) return; vc[p.marca] = 1; var m = meio(D, V3, p); rotular(D, m[0], m[1], [p.marca], areaC, { dist: [8, 12, 16, 22] }); });
      var b0 = V3.uv(colB[0], colB[1]); c.balaoLig(b0[0], b0[1], 7, areaC, c.folhaBase);
    }
    return { escala: "INDICADA" };
  }
  function refs(d, pc) {
    var bs = pc.filter(function (p) { return p.grupo === "banzoSup" || p.grupo === "viga"; }), bc = pc.filter(function (p) { return p.grupo === "banzoColuna" || p.grupo === "pilar"; });
    var o = {}, xs = [];
    bs.forEach(function (p) { xs.push(p.A, p.B); });
    if (xs.length) {
      o.cumeeira = xs.reduce(function (m, q) { return q[1] > m[1] ? q : m; }, xs[0]);
      o.joelho = xs.reduce(function (m, q) { return q[0] < m[0] ? q : m; }, xs[0]);
      var alvo = d.ex0 + (d.ex1 - d.ex0) * 0.22, tops = pc.filter(function (p) { return p.grupo === "montante"; }).map(function (p) { return p.A[1] > p.B[1] ? p.A : p.B; });
      if (!tops.length) tops = xs;
      o.noBanzo = tops.reduce(function (m, q) { return Math.abs(q[0] - alvo) < Math.abs(m[0] - alvo) ? q : m; }, tops[0]);
    }
    var ns = []; bc.forEach(function (p) { ns.push(p.A, p.B); });
    if (ns.length) o.base = ns.reduce(function (m, q) { return (q[1] < m[1] - 1e-6 || (Math.abs(q[1] - m[1]) < 1e-6 && q[0] < m[0])) ? q : m; }, ns[0]);
    return o;
  }

  /* ================================================================ FOLHA 04 — DETALHES DAS LIGAÇÕES */
  function detalheRecorte(c, x, y, w, h, numero, titulo, centro, wm, hm, pecas, linhasNota, secoes) {
    var D = c.D, esc = escolherEscala(wm, hm, w - 10, h - 34, 5), s = 1000 / esc;
    tituloEm(c, x, y, titulo, "ESCALA 1:" + esc, numero);
    var cx = x + w / 2, cy = y + 22 + (h - 34) / 2;
    var R = [cx - wm * s / 2, cy - hm * s / 2, cx + wm * s / 2, cy + hm * s / 2];
    var V = new Vista(centro.u, centro.v, centro.cu - wm / 2, centro.cv + hm / 2, esc, R[0], R[1]);
    var vist = {};
    var vis = pecas.filter(function (p) { var a = V.p(p.A), b = V.p(p.B); return !!segClip(a, b, R); });
    desenharPecas(D, V, vis, { lado: centro.lado || "alt", recorte: R });
    D.ret(R[0] - 1.5, R[1] - 1.5, R[2] - R[0] + 3, R[3] - R[1] + 3, "MET-FINA", ' stroke-dasharray="4 1.5 1 1.5"');
    /* peças CORTADAS pelo plano da vista: a seção cheia no ponto de corte (corte de verdade, não projeção) */
    arr(secoes).forEach(function (q) {
      var a = V.uv(q.u, q.v); if (a[0] < R[0] || a[0] > R[2] || a[1] < R[1] || a[1] > R[3]) return;
      if (q.p.s.P && q.p.s.P.forma === "frio") desenharU(D, a[0], a[1], q.p.s, V.s, true);
      else { var hw = Math.max(q.p.s.larg * V.s / 2, 0.4), hh = Math.max(q.p.s.alt * V.s / 2, 0.4); D.cheio([[a[0] - hw, a[1] - hh], [a[0] + hw, a[1] - hh], [a[0] + hw, a[1] + hh], [a[0] - hw, a[1] + hh]]); }
      if (!vist[q.p.marca + q.p.cat]) { vist[q.p.marca + q.p.cat] = 1; rotular(D, a[0], a[1], [q.p.marca + " - " + curto(q.p.cat) + " (CORTADO)"], [x + 1, y + 14, x + w - 1, y + h - 8], { dist: [6, 10, 14, 19] }); }
    });
    var area = [x + 1, y + 14, x + w - 1, y + h - 8];
    vis.forEach(function (p) {
      if (vist[p.marca + p.cat]) return; vist[p.marca + p.cat] = 1;
      var a = V.p(p.A), b = V.p(p.B), cl = segClip(a, b, R); if (!cl) return;
      var m = [(cl[0][0] + cl[1][0]) / 2, (cl[0][1] + cl[1][1]) / 2];
      rotular(c.D, m[0], m[1], [p.marca + " - " + curto(p.cat)], area, { dist: [6, 10, 14, 19] });
    });
    var cn = centro.alvo ? V.uv(centro.alvo[0], centro.alvo[1]) : V.uv(centro.cu, centro.cv);   /* a nota da solda aponta o nó da ligação */
    var notaL = (linhasNota || ["SOLDA DE FILETE EM TODO O CONTORNO", "PERNA A DIMENSIONAR"]).map(function (t) { return { t: t, cor: VERM }; });
    /* sem lugar livre com chamada perto do nó: a nota vai para o pé do detalhe (faixa reservada), sem chamada */
    if (!rotular(D, cn[0], cn[1], notaL, area, { dist: [8, 13, 18, 24], janela: 150 })) { D.semLugar.pop(); D.textos(x + 2, y + h - 4 - notaL.length * D.E.T.nota * 1.45 - 2, notaL, D.E.T.nota, {}); }
    D.texto(x + 2, y + h - 3, NOTA_LIG, D.E.T.nota, { cor: VERM });
    c.ocupa(x, y, w, h);
  }
  function folhaDetalhes(c) {
    var D = c.D, d = c.d, A = c.geo.area, pt = porticoTipo(d), pc = pt.pecas, ref = refs(d, pc);
    var cols = 3, rows = 2, gw = A.w / cols, gh = A.h / rows, k = 0;
    function cel(i) { return [A.x + (i % cols) * gw + 3, A.y + Math.floor(i / cols) * gh + 3, gw - 6, gh - 6]; }
    var elev = { u: uX, v: vY, lado: "alt" };
    function C(P, alvo) { return { u: uX, v: vY, cu: P[0], cv: P[1], lado: "alt", alvo: alvo || null }; }
    if (ref.noBanzo) { var q = cel(k++); detalheRecorte(c, q[0], q[1], q[2], q[3], 1, "NÓ TÍPICO DO BANZO SUPERIOR", C(ref.noBanzo), 0.7, 0.9, pc, ["DIAGONAL/MONTANTE SOLDADOS AO BANZO", "SOLDA DE FILETE - PERNA A DIMENSIONAR"]); }
    if (ref.joelho) { var q2 = cel(k++); var cJ = [ref.joelho[0] + 0.25, ref.joelho[1] - 0.45]; detalheRecorte(c, q2[0], q2[1], q2[2], q2[3], 2, "LIGAÇÃO COLUNA x TESOURA (JOELHO)", C(cJ, ref.joelho), 0.9, 1.5, pc, ["BANZOS DA TESOURA SOLDADOS À COLUNA", "SOLDA DE FILETE - PERNA A DIMENSIONAR"]); }
    if (ref.cumeeira) { var q3 = cel(k++); detalheRecorte(c, q3[0], q3[1], q3[2], q3[3], 3, "CUMEEIRA", C([ref.cumeeira[0], ref.cumeeira[1] - num(d.par.alturaTrelica, 0.6) / 2], ref.cumeeira), 1.0, num(d.par.alturaTrelica, 0.6) + 0.4, pc, ["EMENDA DE CAMPO NA CUMEEIRA", "A DIMENSIONAR (SOLDA OU PARAFUSO)"]); }
    /* 4 — terça × banzo superior: corte no plano do pórtico ao longo de z (vista lateral recortada do modelo) */
    var tc = d.pecas.filter(function (p) { return p.grupo === "terca"; }), q4 = cel(k++);
    if (tc.length && ref.noBanzo) {
      var t0 = tc.reduce(function (m, p) { return Math.abs(p.A[0] - ref.noBanzo[0]) < Math.abs(m.A[0] - ref.noBanzo[0]) ? p : m; }, tc[0]);
      var zc = pt.z, xt = t0.A[0], paral = [], cortes = [];
      d.pecas.forEach(function (p) {
        if (Math.min(p.A[2], p.B[2]) > zc + 1 || Math.max(p.A[2], p.B[2]) < zc - 1) return;
        if (Math.abs(p.A[0] - xt) < 0.06 && Math.abs(p.B[0] - xt) < 0.06) { paral.push(p); return; }
        var a0 = p.A[0], b0 = p.B[0]; if ((a0 - xt) * (b0 - xt) >= 0) return;
        var t = (xt - a0) / (b0 - a0); cortes.push({ p: p, u: p.A[2] + (p.B[2] - p.A[2]) * t, v: p.A[1] + (p.B[1] - p.A[1]) * t });
      });
      detalheRecorte(c, q4[0], q4[1], q4[2], q4[3], 4, "TERÇA x BANZO SUPERIOR (CORTE)", { u: uZ, v: vY, cu: zc, cv: t0.A[1] - 0.06, lado: "alt" }, 0.8, 0.4, paral, ["APOIO DA TERÇA NO BANZO (CHAPA/CLIP)", "A DIMENSIONAR - NÃO MODELADO"], cortes);
    } else { pendencia(c, q4, 4, "TERÇA x BANZO SUPERIOR", "O modelo não tem terças sobre banzo: não há detalhe."); }
    /* 5 — contraventamento da cobertura: planta recortada no canto */
    var cv = d.pecas.filter(function (p) { return p.grupo === "contravento" && noTelhado(d, p); }), q5 = cel(k++);
    if (cv.length) {
      var c0 = cv.reduce(function (m, p) { var a = Math.min(p.A[2], p.B[2]) + Math.min(p.A[0], p.B[0]); return a < (Math.min(m.A[2], m.B[2]) + Math.min(m.A[0], m.B[0])) ? p : m; }, cv[0]);
      var Pc = c0.A[0] + c0.A[2] < c0.B[0] + c0.B[2] ? c0.A : c0.B;
      var tel = d.pecas.filter(function (p) { return noTelhado(d, p) && !/^(banzoInf|escora|montante|diagonal|maoFrancesa)$/.test(p.grupo); });
      detalheRecorte(c, q5[0], q5[1], q5[2], q5[3], 5, "CONTRAVENTAMENTO DA COBERTURA (PLANTA)", { u: uZ, v: vX, cu: Pc[2] + 0.4, cv: Pc[0] + 0.5, lado: "larg", alvo: [Pc[2], Pc[0]] }, 1.6, 1.6, tel, ["FIXAÇÃO DA BARRA (OLHAL/ESTICADOR)", "A DIMENSIONAR - NÃO MODELADO"]);
    } else pendencia(c, q5, 5, "CONTRAVENTAMENTO DA COBERTURA", "Sem contraventamento de cobertura no modelo.");
    /* 6 — calha: não está no modelo */
    var q6 = cel(k++);
    pendencia(c, q6, 6, "CALHA E SUPORTE DA CALHA", "A CALHA NÃO CONSTA DO MODELO. Definir seção (largura, altura, espessura da chapa), caimento, bocais e o suporte antes de emitir. Nada foi desenhado de cabeça.");
    return { escala: "INDICADA" };
  }
  function pendencia(c, q, numero, titulo, texto) {
    var D = c.D; tituloEm(c, q[0], q[1], titulo, "SEM ESCALA", numero);
    D.ret(q[0] + 4, q[1] + 24, q[2] - 8, q[3] - 34, "MET-PEND");
    D.texto(q[0] + 8, q[1] + 32, "PENDÊNCIA", D.E.T.nota * 1.2, { cor: VERM });
    D.textos(q[0] + 8, q[1] + 36, [{ t: texto, cor: VERM }], D.E.T.nota, { wmax: q[2] - 18 });
    c.ocupa(q[0], q[1], q[2], q[3]);
  }

  /* ================================================================ FOLHA 05 — BASE, CHUMBADORES E SEÇÕES */
  function folhaBaseSecoes(c) {
    var D = c.D, d = c.d, A = c.geo.area, T = D.E.T, pt = porticoTipo(d), pc = pt.pecas, ref = refs(d, pc);
    var bc = pc.filter(function (p) { return (p.grupo === "banzoColuna" || p.grupo === "pilar") && Math.min(p.A[1], p.B[1]) <= d.y0 + 1e-3; });
    var NRm = NR(), pf = NRm ? NRm.parafuso("3/4\"") : null, db = pf ? pf.d : 19.05;
    var borda = NRm ? Math.ceil(NRm.bordaMin(db, "laminada").e / 5) * 5 : 30;
    var x = A.x + 4, y = A.y + 2, hReg = A.h * 0.5, s = 200;   /* 1:5 → 200 mm de papel por m */
    tituloEm(c, x, y, "BASE DA COLUNA E CHUMBADORES - PLANTA E ELEVAÇÃO", "ESCALA 1:5", 7);
    var lc0 = num(d.par.larguraColuna, 0.5);
    bc = bc.filter(function (p) { return Math.min(p.A[0], p.B[0]) <= d.ex0 + lc0 + 0.02; });
    if (!bc.length) { D.texto(x, y + 30, "Sem coluna no pórtico tipo.", T.nota, { cor: VERM }); }
    else {
      var xs = bc.map(function (p) { return Math.min(p.A[0], p.B[0]); }), xa = Math.min.apply(null, xs), xb = Math.max.apply(null, xs);
      var sc = bc[0].s, larg = (xb - xa) + sc.larg, alt = sc.alt;   /* a "seção" da coluna na base: dos banzos de fora a fora */
      /* PARTIDA do js/metalligacao.js (placaBase): seção + 2 x 75 mm (arredondado a 10 mm), t 25 mm, graute 25 mm, ancoragem 0,40 m */
      var Bp = Math.ceil((larg + 0.15) * 100 - 1e-9) / 100, Np = Math.ceil((alt + 0.15) * 100 - 1e-9) / 100, tp = 0.025, gr = 0.025, anc = 0.40, e = Math.max(borda / 1000, 0.035);
      /* planta da placa */
      var px0 = x + 36, py0 = y + 46;
      D.ret(px0, py0, Bp * s, Np * s, "MET-PERFIL");
      var cx = px0 + Bp * s / 2, cyy = py0 + Np * s / 2;
      bc.forEach(function (p) { var x1 = Math.min(p.A[0], p.B[0]), xx = x1 - xa - (xb - xa) / 2; desenharU(D, cx + xx * s, cyy, p.s, s, true, x1 > xa + 1e-3); });
      var furos = [[e, e], [Bp - e, e], [Bp - e, Np - e], [e, Np - e]];
      furos.forEach(function (f) { D.furo(px0 + f[0] * s, py0 + f[1] * s, db / 2 / 1000 * s + 0.6); });
      D.cadeia([[px0, py0], [px0 + e * s, py0], [px0 + (Bp - e) * s, py0], [px0 + Bp * s, py0]], 9, [mm(e), mm(Bp - 2 * e), mm(e)], {});
      D.cota(px0, py0, px0 + Bp * s, py0, 18, mm(Bp));
      D.cadeia([[px0, py0 + Np * s], [px0, py0 + (Np - e) * s], [px0, py0 + e * s], [px0, py0]], 9, [mm(e), mm(Np - 2 * e), mm(e)], {});
      D.cota(px0, py0 + Np * s, px0, py0, 18, mm(Np));
      D.cota(cx + (-(xb - xa) / 2) * s, py0 + Np * s, cx + ((xb - xa) / 2) * s, py0 + Np * s, -8, mm(xb - xa), { foraSeUnico: true });
      /* elevação */
      var ex0 = px0 + Bp * s + 80, eyTop = y + 30, hCol = 0.30 * s, eyPl = eyTop + hCol;
      bc.forEach(function (p) { var xx = Math.min(p.A[0], p.B[0]) - xa - (xb - xa) / 2; var xc = ex0 + Bp * s / 2 + xx * s; faixa(D, [xc, eyPl], [xc, eyTop], sc.larg * s, "MET-PRINCIPAL"); });
      D.quebra(ex0 + Bp * s / 2 - larg * s / 2 - 4, eyTop, ex0 + Bp * s / 2 + larg * s / 2 + 4, eyTop);
      D.ret(ex0, eyPl, Bp * s, tp * s, "MET-PERFIL-CORTE");
      D.hachura(ex0, eyPl, Bp * s, tp * s, 1.2);
      var eyG = eyPl + tp * s;
      D.ret(ex0 - 3, eyG, Bp * s + 6, gr * s, "MET-FINA");
      var eyC = eyG + gr * s;
      D.linha(ex0 - 30, eyC, ex0 + Bp * s + 30, eyC, "MET-CONTEXTO");
      D.nivel(ex0 + Bp * s + 26, eyC, "TOPO DA FUNDAÇÃO", 1);
      [e, Bp - e].forEach(function (u) { var xc = ex0 + u * s, r = db / 2 / 1000 * s; D.linha(xc - r, eyPl - 3, xc - r, eyC + anc * s, "MET-OCULTA"); D.linha(xc + r, eyPl - 3, xc + r, eyC + anc * s, "MET-OCULTA"); D.ret(xc - pf.s / 2 / 1000 * s, eyPl - 3.6, pf.s / 1000 * s, 3.6, "MET-SECUNDARIO"); });
      D.cadeia([[ex0 + Bp * s + 10, eyC + anc * s], [ex0 + Bp * s + 10, eyC], [ex0 + Bp * s + 10, eyG], [ex0 + Bp * s + 10, eyPl]], -8, [mm(anc), mm(gr), mm(tp)], {});
      var area = [x, y + 14, A.x + A.w - 2, y + hReg - 30];
      rotular(D, ex0 + Bp * s * 0.3, eyPl + tp * s / 2, ["PLACA DE BASE " + mm(Bp) + " x " + mm(Np) + " x " + mm(tp), "ASTM A36"], area, { dist: [14, 22, 30, 40] });
      rotular(D, ex0 + Bp * s * 0.8, eyG + gr * s / 2, ["GRAUTE NÃO RETRÁTIL " + mm(gr)], area, { dist: [14, 22, 30, 40] });
      rotular(D, ex0 + (Bp - e) * s, eyC + anc * s * 0.6, ["4 CHUMBADORES " + (pf ? pf.id : "3/4\"") + " ASTM F1554 GR.36", "ANCORAGEM " + mm(anc) + " (DADO DE PROJETO)"], area, { dist: [14, 22, 30, 40] });
      rotular(D, ex0 + Bp * s / 2 + (xb - xa) / 2 * s, eyTop + hCol * 0.4, [bc[0].marca + " - " + curto(bc[0].cat)], area, { dist: [14, 22, 30, 40] });
      D.textos(x + 4, y + hReg - 24, ["FURO ALARGADO; ARRUELA ESPECIAL E PORCA DUPLA; BORDA DE PARTIDA " + borda + " mm (NBR 8800, TABELA 14).",
        { t: NOTA_PARTIDA, cor: VERM }, { t: "BASE ROTULADA NO CÁLCULO. " + NOTA_LIG + ".", cor: VERM }], T.nota, {});
    }
    c.ocupa(x, y, A.w - 8, hReg);
    /* seções dos perfis (1:2) */
    var ys = A.y + A.h * 0.55, usados = {}, lista = [];
    d.pecas.forEach(function (p) { if (!usados[p.cat]) { usados[p.cat] = 1; lista.push(p); } });
    var altMax = Math.max.apply(null, lista.map(function (p) { return Math.max(p.s.alt, p.s.larg); })), eS = altMax * 1000 / 2 <= 80 ? 2 : (altMax * 1000 / 5 <= 80 ? 5 : 10);
    tituloEm(c, A.x + 4, ys, "SEÇÕES DOS PERFIS", "ESCALA 1:" + eS, null);
    var s2 = 1000 / eS, xx = A.x + 14, yy = ys + 30, hMax = 0;
    lista.forEach(function (p) {
      var w = p.s.larg * s2, h = p.s.alt * s2;
      if (xx + w + 44 > A.x + A.w) { xx = A.x + 14; yy += hMax + 34; hMax = 0; }
      secaoPerfil(D, xx, yy, p.s, s2);
      D.cota(xx, yy + h, xx + w, yy + h, -7, mm(p.s.larg), { foraSeUnico: true });
      D.cota(xx, yy + h, xx, yy, 7, mm(p.s.alt), { foraSeUnico: true });
      var t = p.s.P && p.s.P.t ? "t = " + br(p.s.P.t * 1000, 2) : "";
      D.textos(xx, yy + h + 11, [curto(p.cat), t, "(" + p.marca + ")"], T.nota, {});
      hMax = Math.max(hMax, h + 18);
      xx += Math.max(w, AP().largTexto(curto(p.cat), T.nota)) + 26;
    });
    c.ocupa(A.x, ys, A.w, yy + hMax - ys);
    return { escala: "INDICADA" };
  }
  function desenharU(D, cx, cy, s, k, cheio, espelho) {
    var P = s.P; if (!P || P.forma !== "frio") { D.ret(cx - s.larg * k / 2, cy - s.alt * k / 2, s.larg * k, s.alt * k, "MET-PERFIL"); return; }
    var bw = P.bw * k, bf = P.bf * k, t = Math.max(P.t * k, 0.3), x0 = cx - bf / 2, y0 = cy - bw / 2;
    var Q = [[x0, y0], [x0 + bf, y0], [x0 + bf, y0 + t], [x0 + t, y0 + t], [x0 + t, y0 + bw - t], [x0 + bf, y0 + bw - t], [x0 + bf, y0 + bw], [x0, y0 + bw]];
    if (espelho) Q = Q.map(function (q) { return [2 * cx - q[0], q[1]]; });
    if (cheio) D.cheio(Q); else D.poli(Q, "MET-PERFIL", true);
  }
  function secaoPerfil(D, x, y, s, k) {
    var P = s.P; if (!P) { D.ret(x, y, s.larg * k, s.alt * k, "MET-PEND"); return; }
    var w = s.larg * k, h = s.alt * k, t = Math.max((P.t || 0) * k, 0.35);
    if (P.forma === "frio") { desenharU(D, x + w / 2, y + h / 2, s, k, true); return; }
    if (P.forma === "L") { D.cheio([[x, y], [x + t, y], [x + t, y + h - t], [x + w, y + h - t], [x + w, y + h], [x, y + h]]); return; }
    if (P.forma === "circ") { D.add('<circle cx="' + n3(x + w / 2) + '" cy="' + n3(y + h / 2) + '" r="' + n3(w / 2) + '" fill="#000"/>'); D.traco([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true); return; }
    if (P.forma === "tubo-ret") {
      D.traco([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
      D.add('<path fill-rule="evenodd" fill="#000" d="M' + n3(x) + " " + n3(y) + "h" + n3(w) + "v" + n3(h) + "h" + n3(-w) + "z M" + n3(x + t) + " " + n3(y + t) + "v" + n3(h - 2 * t) + "h" + n3(w - 2 * t) + "v" + n3(-(h - 2 * t)) + 'z"/>');
      return;
    }
    D.ret(x, y, w, h, "MET-PERFIL");
  }

  /* ================================================================ FOLHA 06 — QUADRO DE MATERIAIS E TABELA DE AÇO */
  function quantitativo(d) {
    var pos = {};
    d.pecas.forEach(function (p) {
      var k = p.conj + "|" + p.marca + "|" + p.cat;
      var q = pos[k] || (pos[k] = { conj: p.conj, marca: p.marca, papel: p.papel, cat: p.cat, aco: p.aco, n: 0, L: 0, kgm: p.s.kgm });
      q.n++; q.L += p.L;
    });
    return Object.keys(pos).map(function (k) { var q = pos[k]; q.peso = q.L * q.kgm; return q; });
  }
  var ORDEM_CONJ = ["COLUNA TRELIÇADA", "PÓRTICO", "TESOURA", "TERÇAS E CORRENTES", "TRAVAMENTO", "CONTRAVENTAMENTO", "TAPAMENTO", "OUTROS"];
  function folhaMateriais(c) {
    var D = c.D, d = c.d, A = c.geo.area, T = D.E.T, Q = c.quant;
    Q.sort(function (a, b) { return ORDEM_CONJ.indexOf(a.conj) - ORDEM_CONJ.indexOf(b.conj) || (a.marca < b.marca ? -1 : 1); });
    var x = A.x + 6, y = A.y + 4;
    tituloEm(c, x, y, "QUADRO DE MATERIAIS POR CONJUNTO", "SEM ESCALA", null);
    var cols = [{ t: "CONJUNTO", w: 52, al: "E" }, { t: "MARCA", w: 16 }, { t: "PEÇA", w: 76, al: "E" }, { t: "PERFIL", w: 58, al: "E" }, { t: "AÇO", w: 36 }, { t: "QTDE", w: 16 }, { t: ["COMP.", "TOTAL (m)"], w: 24 }, { t: ["MASSA", "(kg/m)"], w: 20 }, { t: ["PESO", "(kg)"], w: 24 }];
    var lin = [], tot = 0, atual = null, sub = 0;
    function fechar() { if (atual != null) lin.push({ total: ["SUBTOTAL " + atual, "", "", "", "", "", "", "", br(sub, 1)] }); }
    Q.forEach(function (q) {
      if (q.conj !== atual) { fechar(); atual = q.conj; sub = 0; }
      lin.push([q.conj, q.marca, txt(q.papel).toUpperCase(), curto(q.cat), curto(q.aco), String(q.n), br(q.L, 2), q.kgm > 0 ? br(q.kgm, 2) : { t: "?", cor: VERM }, br(q.peso, 1)]);
      sub += q.peso; tot += q.peso;
    });
    fechar();
    lin.push({ total: ["TOTAL GERAL", "", "", "", "", "", "", "", br(tot, 0)] });
    var tb = D.tabela(x, y + 22, cols, lin, { fs: T.tabela * 0.92 });
    c.ocupa(x, y, tb.w, tb.h + 22);
    /* tabela de aço: resumo por perfil */
    var porP = {}; Q.forEach(function (q) { var o = porP[q.cat] || (porP[q.cat] = { cat: q.cat, L: 0, peso: 0, kgm: q.kgm, aco: q.aco }); o.L += q.L; o.peso += q.peso; });
    var lp = Object.keys(porP).map(function (k) { return porP[k]; }).sort(function (a, b) { return b.peso - a.peso; });
    var y2 = y + 22 + tb.h + 14;
    if (y2 + 22 + (lp.length + 3) * 4.8 > A.y + A.h) { y2 = y + 22; x = x + tb.w + 10; }
    tituloEm(c, x, y2, "TABELA DE AÇO - RESUMO POR PERFIL", "SEM ESCALA", null);
    var cols2 = [{ t: "PERFIL", w: 70, al: "E" }, { t: "AÇO", w: 36 }, { t: ["COMP.", "TOTAL (m)"], w: 24 }, { t: ["MASSA", "(kg/m)"], w: 20 }, { t: ["PESO", "(kg)"], w: 24 }, { t: ["PESO +", "5% (kg)"], w: 24 }];
    var l2 = lp.map(function (o) { return [curto(o.cat), curto(o.aco), br(o.L, 2), br(o.kgm, 2), br(o.peso, 1), br(o.peso * 1.05, 1)]; });
    var area = (d.x1 - d.x0) * (d.z1 - d.z0);
    l2.push({ total: ["TOTAL", "", "", "", br(tot, 0), br(tot * 1.05, 0)] });
    l2.push({ titulo: "TAXA: " + br(tot / (area || 1), 2) + " kg/m2 (" + br(area, 0) + " m2 em planta). MASSA PELA SEÇÃO NOMINAL (LINHA MÉDIA), SEM CHAPAS DE LIGAÇÃO, SOLDA E PARAFUSOS." });
    var tb2 = D.tabela(x, y2 + 22, cols2, l2, { fs: T.tabela * 0.92 });
    c.ocupa(x, y2, Math.max(tb2.w, 198), tb2.h + 26);
    /* PERSPECTIVA ISOMÉTRICA do modelo (as peças em linha, sem escala) no espaço que sobra à direita das tabelas */
    var xI = Math.max(A.x + 6 + tb.w, x + Math.max(tb2.w, 198)) + 14, wI = A.x + A.w - xI - 4;
    if (wI > 140) {
      var c30 = Math.cos(Math.PI / 6), uI = function (P) { return (P[0] - P[2]) * c30; }, vI = function (P) { return P[1] + (P[0] + P[2]) * 0.5; };
      var bI = caixaPecas(d.pecas, uI, vI), wm = bI[2] - bI[0], hm = bI[3] - bI[1];
      var eI = escolherEscala(wm, hm, wI - 10, A.h - 60, 50), sI = 1000 / eI, oxI = xI + (wI - wm * sI) / 2, oyI = A.y + 30;
      var VI = new Vista(uI, vI, bI[0], bI[3], eI, oxI, oyI);
      tituloEm(c, xI, A.y + 4, "PERSPECTIVA ISOMÉTRICA DA ESTRUTURA", "SEM ESCALA", null);
      desenharPecas(D, VI, d.pecas.filter(function (p) { return p.grupo !== "corrente"; }), { lado: "alt", fino: function () { return true; }, semPonta: true });
      c.ocupa(xI, A.y + 4, wI, hm * sI + 30);
    }
    return { escala: "SEM ESCALA" };
  }

  /* ================================================================ NOTAS (coluna da direita, todas as folhas) */
  function blocosNotas(c) {
    var p = c.d.par, calc = c.op.calculo || null, itens = [];
    var b1 = { titulo: "NOTAS GERAIS", numerar: true, itens: [
      "Unidades em milímetros; níveis em metros.",
      "Aço dos perfis formados a frio: " + txt(p.acoFrio || "-") + "; tubos sem costura: " + txt(p.acoTubo || "-") + "; tubos com costura (Tuper): " + txt(p.acoTuboCostura || "NBR 8261 Gr A") + " — comprar pela NBR 8261 com certificado de usina (sem a norma o escoamento não é garantido)" + "; cantoneiras e barras: " + txt(p.acoBarra || "-") + "; chapas: ASTM A36.",
      "Solda: eletrodo E70XX (AWS A5.1) ou arame ER70S-6 (AWS A5.18); simbologia AWS A2.4.",
      "Parafusos de ligação (quando houver): ASTM A325; chumbadores ASTM F1554 Gr.36.",
      "Desenhos gerados do modelo da estrutura (" + txt((c.tipo && c.tipo.rotulo) || c.d.M.tipo) + "): vão " + br(c.d.vao, 2) + " m, " + p.nPorticos + " pórticos " + (p.posicoes && p.posicoesInfo && !p.posicoesInfo.uniforme ? "em vãos de " + br(p.espacamentoMin, 2) + " a " + br(p.espacamento, 2) + " m" : "a cada " + br(p.espacamento, 2) + " m") + ", pé-direito " + br(c.d.pe, 2) + " m.",
      "Conferir as medidas na obra antes de fabricar."
    ] };
    var b2 = { titulo: "LIGAÇÕES", itens: [
      { t: "As ligações não são dimensionadas pelo cálculo da estrutura: todos os detalhes saem como " + NOTA_LIG + ".", cor: VERM },
      { t: "Placa de base com dimensões de partida (seção + 2 x 75 mm, t 25 mm, 4 chumbadores 3/4\"): dimensionar com as reações do cálculo.", cor: VERM }
    ] };
    var nv = arr(c.d.M.naoVerificados).map(function (x) { return { t: txt(x.tema || x) + (x.motivo ? ": " + txt(x.motivo).slice(0, 160) + (txt(x.motivo).length > 160 ? "..." : "") : ""), cor: VERM }; });
    var b3 = { titulo: "NÃO VERIFICADO", itens: nv.length ? nv : ["(nenhum declarado pela tipologia)"] };
    var sit = calc ? [{ t: "Situação do cálculo: " + txt(calc.situacao || (calc.aprovado ? "aprovado" : "não aprovado")), cor: calc.aprovado ? null : VERM }].concat(calc.aprovado ? [] : [{ t: "NÃO EMITIR PARA FABRICAÇÃO enquanto o cálculo não aprovar.", cor: VERM }])
      : [{ t: "Cálculo não anexado a estas folhas: conferir o memorial antes de emitir. NÃO EMITIR PARA FABRICAÇÃO sem o cálculo aprovado.", cor: VERM }];
    var b4 = { titulo: "SITUAÇÃO", itens: sit };
    return [b1, b2, b3, b4];
  }

  /* ================================================================ título, ocupação, balão */
  function tituloEm(c, x, y, titulo, escala, numero) { var h = AP().tituloVista(c.D, x, y, titulo, escala, numero); c.ocupa(x, y, Math.max(AP().largTexto(titulo, c.D.E.T.titulo) + (numero != null ? 12 : 0), 20), h, true); return h; }

  /* ================================================================ conferência */
  function textoXTraco(D) {
    var out = [], cx = D.caixas || [];
    cx.forEach(function (b) {
      var xs = b.p.map(function (q) { return q[0]; }), ys = b.p.map(function (q) { return q[1]; });
      var R = [Math.min.apply(null, xs) + 0.35, Math.min.apply(null, ys) + 0.35, Math.max.apply(null, xs) - 0.35, Math.max.apply(null, ys) - 0.35];
      if (R[2] <= R[0] || R[3] <= R[1]) return;
      for (var i = 0; i < D.sg.length; i++) {
        var s = D.sg[i], cl = segClip([s[0], s[1]], [s[2], s[3]], R);
        if (cl && hip(cl[0][0] - cl[1][0], cl[0][1] - cl[1][1]) > 0.3) { out.push(b.s + " @ " + s.map(function (v) { return Math.round(v * 10) / 10; }).join(",")); break; }
      }
    });
    return out;
  }

  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }

  function gerar(M, opcoes) {
    opcoes = opcoes || {};
    var avisos = [], Ap = AP(), P = PR();
    if (!Ap || !P) return { ok: false, folhas: [], avisos: ["Motores de prancha (js/acopranchas.js, js/prancha.js) não carregados."] };
    if (M && !M.barras && M.tipo) { var Mp = MPo(); if (!Mp) return { ok: false, folhas: [], avisos: ["js/metalporticos.js não carregado."] }; M = Mp.modelo(M.tipo, M.par || {}); }
    if (!M || !M.ok || !arr(M.barras).length || !M.nos) return { ok: false, folhas: [], avisos: [(M && M.motivo) || "Modelo sem barras: as pranchas executivas saem das tipologias que entregam nós e barras (motor da estrutura desenhada)."] };
    var d = preparar(M); if (!d.pecas.length) return { ok: false, folhas: [], avisos: ["Modelo sem peças desenháveis."] };
    var semSec = {}; d.pecas.forEach(function (p) { if (!p.s.P) semSec[p.cat] = 1; });
    if (Object.keys(semSec).length) avisos.push("Perfil fora do catálogo carregado (massa e seção pendentes): " + Object.keys(semSec).join(", "));
    var E = Ap.estilo(opcoes.padrao), formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA");
    var Mp2 = MPo(), tipo = Mp2 && Mp2.TIPOS ? Mp2.TIPOS[M.tipo] : null;
    var codigo = txt(opcoes.codigo).trim() || "EST-MET-EX", rev = (txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = txt(opcoes.data).trim() || hoje();
    var defs = [
      { id: "exe-planta", titulo: "PLANTA DE MONTAGEM DA COBERTURA", fn: folhaPlanta },
      { id: "exe-elevacoes", titulo: "ELEVAÇÕES LATERAL E FRONTAL", fn: folhaElevacoes },
      { id: "exe-tipo", titulo: "PÓRTICO, TESOURA E COLUNA TIPO", fn: folhaTipo },
      { id: "exe-detalhes", titulo: "DETALHES DAS LIGAÇÕES", fn: folhaDetalhes },
      { id: "exe-base", titulo: "BASE, CHUMBADORES E SEÇÕES DOS PERFIS", fn: folhaBaseSecoes },
      { id: "exe-materiais", titulo: "QUADRO DE MATERIAIS E TABELA DE AÇO", fn: folhaMateriais }
    ];
    var rotDet = dois(4), rotBase = dois(5), quant = quantitativo(d);
    var feitas = [];
    defs.forEach(function (def, i) {
      var D = new Ap.Desenho(E, []), ocup = [];
      var c = { D: D, d: d, E: E, geo: geo, op: opcoes, quant: quant, tipo: tipo, folhaBase: rotBase,
        ocupa: function (x, y, w, h, titulo) { ocup.push({ r: [x, y, x + w, y + h], t: !!titulo, folha: def.id }); },
        balaoLig: function (px, py, numero, area, folha) {
          var cands = []; [14, 20, 28, 38, 50].forEach(function (dd) { [[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1.3], [1.3, 0], [-1.3, 0], [0, 1.3]].forEach(function (k) { var cx = px + k[0] * dd, cy = py + k[1] * dd; if (!area || (cx - 5 > area[0] && cx + 5 < area[2] && cy - 5 > area[1] && cy + 5 < area[3])) cands.push([cx, cy]); }); });
          var livres = cands.filter(function (q) { if (!D.livre([q[0] - 4.6, q[1] - 4.6, q[0] + 4.6, q[1] + 4.6], 0.4)) return false; var dx = px - q[0], dy = py - q[1], L = hip(dx, dy); return L <= 4.7 || !D.cortaTexto(q[0] + dx / L * 4.2, q[1] + dy / L * 4.2, px, py); });
          if (!livres.length) {   /* malha fechada em volta: o lugar livre mais perto (janela de 90 mm) */
            var R = 90, jan = [px - R, py - R, px + R, py + R], best = null, bd = 1e18;
            if (area) jan = [Math.max(jan[0], area[0]), Math.max(jan[1], area[1]), Math.min(jan[2], area[2]), Math.min(jan[3], area[3])];
            for (var yy = jan[1] + 5; yy <= jan[3] - 5; yy += 1.5) for (var xx = jan[0] + 5; xx <= jan[2] - 5; xx += 1.5) {
              var dd = (xx - px) * (xx - px) + (yy - py) * (yy - py); if (dd >= bd || dd < 100) continue;
              if (D.livre([xx - 4.6, yy - 4.6, xx + 4.6, yy + 4.6], 0.4)) { bd = dd; best = [xx, yy]; }
            }
            if (best) livres = [best];
          }
          if (!livres.length) { (D.semLugar = D.semLugar || []).push("balão " + numero); return; }
          D.marcaLig(livres[0][0], livres[0][1], numero, folha || rotDet, px, py);
        } };
      var res = {};
      try { res = def.fn(c) || {}; } catch (e) { avisos.push("Folha " + dois(i + 1) + " (" + def.titulo + "): " + (e && e.message ? e.message : String(e))); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERM }); }
      feitas.push({ def: def, D: D, escala: res.escala || "INDICADA", rotulo: dois(i + 1), ocup: ocup });
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "metalexecutivo", nome: "Estrutura metálica - projeto executivo", formato: formato, orientacao: "paisagem", origem: "metalica",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional),
                 obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario), contratante: txt(opcoes.contratante), local: txt(opcoes.local),
                 codigo: codigo, data: data, revisoes: [[revNum, txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def.id, n: i + 1, conteudo: f.def.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var blocos = blocosNotas({ d: d, op: opcoes, tipo: tipo }), conf = [];
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, H = geo.papel.h, Mo = geo.moldura, F = new Ap.Desenho(E, null);
      F.ret(Mo.x, Mo.y, Mo.w, Mo.h, "MET-MOLDURA");
      if (!Ap.colunaNotas(F, geo, blocos) && i === 0) avisos.push("As notas não cabem na coluna da direita com a letra mínima do padrão: conferir.");
      Ap.carimbo(F, pr, fl, geo, empObj, opcoes.logo || null, f.rotulo + "/" + dois(feitas.length));
      var numero = codigo + "-" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n3(W) + 'mm" height="' + n3(H) + 'mm" viewBox="0 0 ' + n3(W) + " " + n3(H) + '" font-family="' + Ap.FONTE + '" data-folha="' + f.def.id + '" data-numero="' + numero + '">' +
        "<title>" + numero + " - " + f.def.titulo + " - " + rev + "</title>" + '<rect x="0" y="0" width="' + n3(W) + '" height="' + n3(H) + '" fill="#fff"/><g data-corpo="1">' + D.svg() + "</g>" + F.svg() + "</svg>";
      /* conferência: texto × texto, texto × traço, vistas fora da área ou umas sobre as outras */
      var A = geo.area, fora = [], cruz = [];
      f.ocup.forEach(function (o, k) {
        if (o.r[0] < A.x - 0.5 || o.r[1] < A.y - 0.5 || o.r[2] > A.x + A.w + 0.5 || o.r[3] > A.y + A.h + 0.5) fora.push(k);
      });
      var vistas = f.ocup.filter(function (o) { return !o.t; });
      for (var a = 0; a < vistas.length; a++) for (var b = a + 1; b < vistas.length; b++) { var r1 = vistas[a].r, r2 = vistas[b].r; if (r1[0] < r2[2] - 0.5 && r2[0] < r1[2] - 0.5 && r1[1] < r2[3] - 0.5 && r2[1] < r1[3] - 0.5) cruz.push([a, b]); }
      var tt = Ap.sobreposicoes(D.caixas || [], 0.15), tl = textoXTraco(D);
      conf.push({ folha: numero, textoTexto: tt, textoTraco: tl, semLugar: arr(D.semLugar), foraDaArea: fora.length, vistasSobrepostas: cruz.length, textos: (D.caixas || []).length });
      if (/NaN|undefined/.test(svg)) avisos.push("Folha " + numero + ": há valor inválido (NaN/undefined) no desenho.");
      var o = { id: f.def.id, rotulo: f.rotulo, numero: numero, titulo: f.def.titulo, formato: formato, escala: f.escala, svg: svg };
      o.dxf = { familia: "metalica", pr: pr, folha: fl, geo: geo, empresa: empObj, rotulo: f.rotulo + "/" + dois(feitas.length), logo: !!opcoes.logo, padrao: opcoes.padrao || null, camadas: Ap.PADRAO_ACO.camadas, tituloH: E.T.titulo, codigo: codigo };
      return o;
    });
    return { ok: true, folhas: folhas, avisos: avisos, conferencia: conf, quantitativo: quant, peso: quant.reduce(function (s, q) { return s + q.peso; }, 0) };
  }

  var MetalExecutivo = { gerar: gerar, marcaDe: marcaDe, secao: secao, quantitativo: function (M) { return quantitativo(preparar(M)); }, NOTA_LIG: NOTA_LIG, recorta: recorta,
    /* o conferidor de uma folha (o mesmo do gerar): texto × texto e texto × traço */
    conferir: function (D) { return { textoTexto: AP().sobreposicoes(D.caixas || [], 0.15), textoTraco: textoXTraco(D) }; } };
  global.MetalExecutivo = MetalExecutivo;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalExecutivo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

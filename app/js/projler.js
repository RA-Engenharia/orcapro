/* =====================================================================
 * projler.js — DO PROJETO EM DXF AOS ELEMENTOS MEDIDOS (motor PURO, Node-testável). window.ProjLer.
 *
 * Entrada: o resultado do js/dxf.js + a classificação do js/projclass.js. Saída: o MESMO formato de modelo que o
 * js/mor/ifcorc.js consome (elementos com papel/qto/vaos/ambientes + espacos + pavimentos), para reaproveitar as
 * regras do js/mor/catalogo-dados/implicitos.js (reboco por face, chapisco, pintura, contrapiso, rodapé, soleira,
 * impermeabilização da área molhada…). Cada elemento leva o «Por quê?» (camada, bloco, medida).
 *
 * Passos (todos determinísticos, sem IA):
 *   1. VISTAS: o espaço do modelo tem várias vistas (plantas, cortes, fachadas, situação). Os traços de parede são
 *      agrupados por proximidade (grade de 2 m, componentes conexas) e cada grupo recebe o TÍTULO mais próximo
 *      abaixo dele (bloco de título com atributo TÍTULO/ESC, ou texto «PLANTA…»). Planta de pavimento = título com
 *      PLANTA/PAVIMENTO/TÉRREO/SUPERIOR e sem COBERTURA/LOCAÇÃO/SITUAÇÃO/FORRO/LAYOUT. Sem título: cada grupo
 *      grande é uma planta.
 *   2. PAREDES: js/planta3d.js nos traços das camadas de parede da vista (escada/hachura descartadas antes).
 *   3. VÃOS: duas paredes colineares, mesma espessura, com intervalo de 0,50–2,60 m → um vão; a parede é EMENDADA
 *      através dele (como no IFC: a parede tem o vão dentro). Porta = há arco/bloco/camada de porta no vão
 *      (largura = o vão); janela = há traços finos paralelos à parede dentro do vão (ou bloco/camada de janela);
 *      senão, vão livre (passagem — não conta peça).
 *   4. AMBIENTES: rótulo (texto da camada de ambiente ou atributo AMBIENTE de bloco) + recinto fechado. O recinto
 *      é reconstruído pelo CONTORNO DAS PAREDES (grade de 5 cm, preenchimento a partir do rótulo); área e perímetro
 *      saem dele. Vazou para fora (contorno não fecha) → pendente, com o motivo.
 *   5. LOUÇAS/METAIS e pontos elétricos: inserções classificadas, contadas por tipo e ambiente.
 *   6. ALTURA: «PÉ-DIREITO»/«PD=»/«h=» no texto da vista > diferença de NÍVEIS entre pavimentos > padrão 2,80 m
 *      (DEDUZIDA, amarela). Nada é perguntado (UM CLIQUE, ZERO PERGUNTAS, 14/11/2026); o usuário corrige depois
 *      pelo opts.alturas.
 *   7. ESCALA: a COTA é a fonte da verdade — a mediana de (valor escrito ÷ comprimento medido) das cotas com
 *      texto numérico confere a unidade; divergindo do $INSUNITS, vale a cota e a conferência registra.
 * ===================================================================== */
(function (global) {
  "use strict";

  function mod(g, c) { if (global[g]) return global[g]; if (typeof require === "function") { try { return require(c); } catch (e) { return null; } } return null; }
  var P3 = mod("Planta3D", "./planta3d.js"), PC = mod("ProjClass", "./projclass.js"), Ler = mod("MorIfcLer", "./mor/ifcler.js");
  function sa(s) { var t = String(s == null ? "" : s); try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* */ } return t.toLowerCase(); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function len(s) { var dx = s.x2 - s.x1, dy = s.y2 - s.y1; return Math.sqrt(dx * dx + dy * dy); }
  function fmt(v) { return String(r2(v)).replace(".", ","); }
  function num(t) { var m = /([+-]?\d+(?:[.,]\d+)?)/.exec(String(t || "")); return m ? parseFloat(m[1].replace(",", ".")) : NaN; }
  function mediana(a) { if (!a.length) return NaN; var b = a.slice().sort(function (x, y) { return x - y; }); var k = b.length >> 1; return b.length % 2 ? b[k] : (b[k - 1] + b[k]) / 2; }

  var PE_DIREITO_PADRAO = 2.80, H_PORTA = 2.10, H_JANELA = 1.20, VAO_MIN = 0.50, VAO_MAX = 2.60, CEL = 0.05;
  var RE_AMB = /\b(sala|quarto|dormit|suite|banh|wc|bwc|lavabo|sanit|vestiar|cozinha|copa|refeit|lavand|servico|area|varanda|sacada|terraco|garagem|abrigo|hall|circula|corredor|recep|espera|escrit|consult|atend|deposito|dep\.|dml|almox|despensa|closet|estar|jantar|living|gourmet|churras|piscina|academia|brinquedo|auditor|biblio|laborat|enfermar|fisio|hidrot|terapia|administr|diretor|secretar|arquivo|reuni|lixo|gas|casa de|guarita|portaria|escada|elevador|shaft|loja|salao|oficina|galpao|vaga|estacion|jardim|quintal|plataforma|ginasio|multiuso|ludoteca|triagem|cpd|rack|sala\b)/;
  var RE_NAO_AMB = /^(i ?=|calha|telha|laje|projecao|borda|piso|passeio|calcada|banco|antiderrap|e nao|cobertura|platibanda|rufo|beiral|caixa d|reservat|muro|grade|portao|rampa|nivel|n\.?a\.?|n\.?o\.?)\b/;
  var RE_PLANTA = /planta|pavimento|\bpav\b|terreo|superior|inferior|subsolo|mezanino/;
  var RE_NAO_PLANTA = /cobertura|telhado|locacao|situacao|implanta|forro|layout|paginac|corte|fachada|detalhe|elevacao|vista|isometric|esquema/;

  /* ---------------------------------------------------------------- 7. escala pelas cotas */
  function conferirEscala(dx) {
    /* unidade do TEXTO da cota (convenção brasileira): com vírgula/ponto = metros («2,50»); inteiro = centímetros («250») */
    var razoes = [];
    (dx.cotas || []).forEach(function (c) {
      var L = Math.sqrt(Math.pow(c.x2 - c.x1, 2) + Math.pow(c.y2 - c.y1, 2)); if (!(L > 0.05)) return;
      var t = String(c.texto || "").replace(/<>/g, "").trim(); if (!/^\d+(?:[.,]\d+)?$/.test(t)) return;
      var v = parseFloat(t.replace(",", ".")), u = /[.,]/.test(t) ? 1 : 100;
      if (v > 0) razoes.push((v / u) / L);
    });
    if (razoes.length < 3) return { ok: true, n: razoes.length, nota: razoes.length ? "poucas cotas com texto numérico (" + razoes.length + "): unidade do arquivo mantida" : "", corrige: 1 };
    var m = mediana(razoes);
    var concordam = razoes.filter(function (r) { return Math.abs(r / m - 1) < 0.03; }).length;
    if (Math.abs(Math.log(m)) < Math.log(1.03)) return { ok: true, n: razoes.length, concordam: concordam, mediana: m, nota: concordam + " de " + razoes.length + " cotas conferem a medida do desenho", corrige: 1 };
    if (concordam < Math.max(3, razoes.length / 2) || Math.abs(Math.log(m)) > Math.log(200)) return { ok: false, n: razoes.length, mediana: m, nota: "as cotas não concordam entre si (mediana " + r3(m) + "): unidade do arquivo mantida", corrige: 1 };
    return { ok: true, n: razoes.length, concordam: concordam, mediana: m, corrige: m, nota: "a unidade do arquivo NÃO confere com as cotas (" + concordam + " de " + razoes.length + " concordam): usado o fator das cotas (×" + r3(m) + ")" };
  }
  function escalar(dx, k) {
    if (k === 1) return;
    (dx.segmentos || []).forEach(function (s) { s.x1 *= k; s.y1 *= k; s.x2 *= k; s.y2 *= k; });
    (dx.textos || []).forEach(function (t) { t.x *= k; t.y *= k; });
    (dx.inserts || []).forEach(function (r) { r.x *= k; r.y *= k; if (r.cx != null) { r.cx *= k; r.cy *= k; r.w *= k; r.h *= k; } });
    (dx.hachuras || []).forEach(function (h) { h.contornos.forEach(function (c) { c.forEach(function (p) { p[0] *= k; p[1] *= k; }); }); h.area *= k * k; });
  }

  /* ---------------------------------------------------------------- 1. vistas */
  function agrupar(segs, cel) {
    var mapa = {}, pais = [], ids = [];
    function chave(x, y) { return Math.floor(x / cel) + "," + Math.floor(y / cel); }
    function achar(i) { while (pais[i] !== i) { pais[i] = pais[pais[i]]; i = pais[i]; } return i; }
    function unir(a, b) { a = achar(a); b = achar(b); if (a !== b) pais[b] = a; }
    function marca(x, y) { var k = chave(x, y); if (!(k in mapa)) { mapa[k] = pais.length; pais.push(pais.length); ids.push(k); } return mapa[k]; }
    segs.forEach(function (s) {
      var L = len(s), n = Math.max(1, Math.ceil(L / cel)), prev = -1;
      for (var i = 0; i <= n; i++) { var c = marca(s.x1 + (s.x2 - s.x1) * i / n, s.y1 + (s.y2 - s.y1) * i / n); if (prev >= 0) unir(prev, c); prev = c; }
    });
    ids.forEach(function (k, i) { var p = k.split(","), x = +p[0], y = +p[1]; for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) { var k2 = (x + dx) + "," + (y + dy); if (k2 in mapa) unir(i, mapa[k2]); } });
    var grupos = {};
    segs.forEach(function (s) { var g = achar(mapa[chave(s.x1, s.y1)]); (grupos[g] = grupos[g] || []).push(s); });
    return Object.keys(grupos).map(function (g) {
      var ss = grupos[g], b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      ss.forEach(function (s) { b.x0 = Math.min(b.x0, s.x1, s.x2); b.y0 = Math.min(b.y0, s.y1, s.y2); b.x1 = Math.max(b.x1, s.x1, s.x2); b.y1 = Math.max(b.y1, s.y1, s.y2); });
      return { segs: ss, bbox: b };
    }).sort(function (a, b) { return a.bbox.x0 - b.bbox.x0 || a.bbox.y0 - b.bbox.y0; });
  }
  function titulosDe(dx, cls) {
    var out = [];
    (dx.inserts || []).forEach(function (i) {
      var c = PC.deInsert(cls, i); if (c.classe !== "titulo") return;
      var tit = "", esc = "";
      Object.keys(i.atribs || {}).forEach(function (k) { var kk = sa(k); if (/^titulo$|^title$/.test(kk)) tit = i.atribs[k]; else if (/^esc$|^escala$/.test(kk) && /\d/.test(i.atribs[k])) esc = i.atribs[k]; });
      if (tit) out.push({ titulo: tit, escala: esc, x: i.x, y: i.y, fonte: "bloco «" + i.nome + "»" });
    });
    return out;
  }
  function dentro(b, x, y, folga) { folga = folga || 0; return x >= b.x0 - folga && x <= b.x1 + folga && y >= b.y0 - folga && y <= b.y1 + folga; }

  /* ---------------------------------------------------------------- 3. vãos e emenda das paredes */
  function vaos(paredes, cand) {
    var out = [], i, j, usada = {};
    function eixo(p) { var a = Math.atan2(p.y2 - p.y1, p.x2 - p.x1); return { ux: Math.cos(a), uy: Math.sin(a) }; }
    var mudou = true;
    while (mudou) {
      mudou = false;
      for (i = 0; i < paredes.length && !mudou; i++) {
        var P = paredes[i], e = eixo(P), nx = -e.uy, ny = e.ux;
        for (j = 0; j < paredes.length && !mudou; j++) {
          if (i === j) continue;
          var Q = paredes[j];
          if (Math.abs(P.espessura - Q.espessura) > 0.03) continue;
          var aQ = eixo(Q), dA = Math.abs(Math.atan2(e.ux * aQ.uy - e.uy * aQ.ux, e.ux * aQ.ux + e.uy * aQ.uy)); if (dA > Math.PI / 2) dA = Math.PI - dA;
          if (dA > 0.05) continue;
          if (Math.abs((Q.x1 - P.x1) * nx + (Q.y1 - P.y1) * ny) > 0.04) continue;
          var tp = [P.x1 * e.ux + P.y1 * e.uy, P.x2 * e.ux + P.y2 * e.uy], tq = [Q.x1 * e.ux + Q.y1 * e.uy, Q.x2 * e.ux + Q.y2 * e.uy];
          var pLo = Math.min(tp[0], tp[1]), pHi = Math.max(tp[0], tp[1]), qLo = Math.min(tq[0], tq[1]), qHi = Math.max(tq[0], tq[1]);
          if (qLo < pHi) continue;   /* só Q depois de P (cada par visto uma vez) */
          var gap = qLo - pHi; if (gap < VAO_MIN || gap > VAO_MAX) continue;
          var off = P.x1 * nx + P.y1 * ny;
          var g0 = { x: e.ux * pHi + nx * off, y: e.uy * pHi + ny * off }, g1 = { x: e.ux * qLo + nx * off, y: e.uy * qLo + ny * off };
          var vao = { x1: g0.x, y1: g0.y, x2: g1.x, y2: g1.y, largura: gap, espessura: P.espessura, ux: e.ux, uy: e.uy, nx: nx, ny: ny };
          /* emenda P + vão + Q */
          P.x1 = e.ux * pLo + nx * off; P.y1 = e.uy * pLo + ny * off; P.x2 = e.ux * qHi + nx * off; P.y2 = e.uy * qHi + ny * off;
          P.comprimento = qHi - pLo; P.vaos = (P.vaos || []).concat(Q.vaos || [], [vao]); P.trechos = (P.trechos || 1) + (Q.trechos || 1);
          paredes.splice(j, 1); out.push(vao); mudou = true;
        }
      }
    }
    /* o que há dentro de cada vão decide porta × janela × passagem */
    out.forEach(function (v) {
      var cx = (v.x1 + v.x2) / 2, cy = (v.y1 + v.y2) / 2, r = v.largura / 2 + 0.05;
      var nArco = 0, nPar = 0, porCam = "", blocoP = null, blocoJ = null, angs = [];
      cand.segs.forEach(function (s) {
        var mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
        var ax = (mx - cx) * v.ux + (my - cy) * v.uy, an = (mx - cx) * v.nx + (my - cy) * v.ny;
        if (Math.abs(ax) > r + v.largura * 0.5) return;
        /* ARCO DE ABERTURA: traço curto (curva do PDF/DXF ou polilinha que a imita) com as DUAS pontas à distância
           ≈ largura do vão de um dos batentes (a dobradiça). Vale para arco desenhado como curva ou como retas. */
        var Ls = len(s);
        if ((s.curva || Ls < 0.35) && Math.abs(an) <= v.largura + 0.1) {
          var ehArco = false;
          var e2 = v.espessura / 2;   /* a dobradiça fica numa das QUINAS do vão (face da parede), não no eixo */
          [[v.x1 + v.nx * e2, v.y1 + v.ny * e2], [v.x1 - v.nx * e2, v.y1 - v.ny * e2], [v.x2 + v.nx * e2, v.y2 + v.ny * e2], [v.x2 - v.nx * e2, v.y2 - v.ny * e2], [v.x1, v.y1], [v.x2, v.y2]].forEach(function (h, hi) {
            var d1 = Math.sqrt(Math.pow(s.x1 - h[0], 2) + Math.pow(s.y1 - h[1], 2)), d2 = Math.sqrt(Math.pow(s.x2 - h[0], 2) + Math.pow(s.y2 - h[1], 2));
            if (Math.abs(d1 - v.largura) <= 0.08 * v.largura && Math.abs(d2 - v.largura) <= 0.08 * v.largura) {
              ehArco = true;
              (angs[hi] = angs[hi] || []).push(Math.atan2(s.y1 - h[1], s.x1 - h[0]), Math.atan2(s.y2 - h[1], s.x2 - h[0]));
            }
          });
          if (ehArco) return;
          if (s.curva) return;
        }
        if (Math.abs(an) > v.espessura / 2 + 0.02) return;
        var sx = (s.x2 - s.x1), sy = (s.y2 - s.y1), L = Math.sqrt(sx * sx + sy * sy); if (L < 0.2) return;
        var par = Math.abs((sx * v.ux + sy * v.uy) / L) > 0.98;
        if (s.classe === "porta") porCam = porCam || s.layer;
        if (par && s.classe !== "parede") nPar++;
      });
      /* o arco só conta se for CONTÍNUO e varrer ≥ 60° em volta de um batente (traço solto de texto/hachura não forma isso) */
      angs.forEach(function (lista) {
        if (!lista || lista.length < 6) return;
        var ref = lista[0], rel = lista.map(function (a) { var d = a - ref; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }).sort(function (a, b) { return a - b; });
        var buraco = 0; for (var q = 1; q < rel.length; q++) buraco = Math.max(buraco, rel[q] - rel[q - 1]);
        if (rel[rel.length - 1] - rel[0] >= Math.PI / 3 && buraco <= Math.PI / 9) nArco = Math.max(nArco, rel.length / 2);
      });
      cand.insercoes.forEach(function (it) {
        var x = it.ins.cx != null ? it.ins.cx : it.ins.x, y = it.ins.cy != null ? it.ins.cy : it.ins.y;
        var ax = (x - cx) * v.ux + (y - cy) * v.uy, an = (x - cx) * v.nx + (y - cy) * v.ny;
        if (Math.abs(ax) > r + 0.3 || Math.abs(an) > v.largura + 0.3) return;
        if (it.c.classe === "porta" && it.c.sub !== "etiqueta") blocoP = blocoP || it;
        if (it.c.classe === "janela") blocoJ = blocoJ || it;
      });
      if (blocoP || nArco >= 2 || porCam) { v.tipo = "porta"; v.porque = blocoP ? "bloco de porta «" + blocoP.ins.nome + "» no vão" : (nArco >= 2 ? "arco de abertura no vão" : "traço da camada de porta «" + porCam + "» no vão"); if (blocoP) blocoP.usado = true; }
      else if (blocoJ || nPar >= 2) { v.tipo = "janela"; v.porque = blocoJ ? "bloco de janela «" + blocoJ.ins.nome + "» no vão" : nPar + " traços finos paralelos à parede dentro do vão (caixilho)"; if (blocoJ) blocoJ.usado = true; }
      else { v.tipo = "passagem"; v.porque = "vão sem arco, bloco nem caixilho: passagem livre"; }
    });
    return out;
  }

  /* ---------------------------------------------------------------- 4. recintos pela grade */
  function Grade(bbox, ang) {
    var co = Math.cos(-ang), si = Math.sin(-ang);
    this.co = co; this.si = si;
    var pts = [[bbox.x0, bbox.y0], [bbox.x1, bbox.y0], [bbox.x0, bbox.y1], [bbox.x1, bbox.y1]].map(function (p) { return [p[0] * co - p[1] * si, p[0] * si + p[1] * co]; });
    this.x0 = Math.min.apply(null, pts.map(function (p) { return p[0]; })) - 1; this.y0 = Math.min.apply(null, pts.map(function (p) { return p[1]; })) - 1;
    var x1 = Math.max.apply(null, pts.map(function (p) { return p[0]; })) + 1, y1 = Math.max.apply(null, pts.map(function (p) { return p[1]; })) + 1;
    this.nx = Math.ceil((x1 - this.x0) / CEL); this.ny = Math.ceil((y1 - this.y0) / CEL);
    this.g = new Int32Array(this.nx * this.ny);   /* 0 livre · -1 parede · -2 exterior · k>0 ambiente k */
  }
  Grade.prototype.rot = function (x, y) { return [x * this.co - y * this.si, x * this.si + y * this.co]; };
  Grade.prototype.cel = function (x, y) { var p = this.rot(x, y), i = Math.floor((p[0] - this.x0) / CEL), j = Math.floor((p[1] - this.y0) / CEL); return (i < 0 || j < 0 || i >= this.nx || j >= this.ny) ? -1 : j * this.nx + i; };
  Grade.prototype.parede = function (p) {
    var a = this.rot(p.x1, p.y1), b = this.rot(p.x2, p.y2), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy); if (!(L > 0)) return;
    var ux = dx / L, uy = dy / L, h = p.espessura / 2 + CEL * 0.25, ext = p.espessura / 2 + CEL * 0.25;
    var xs = [a[0] - ux * ext, b[0] + ux * ext], ys = [a[1] - uy * ext, b[1] + uy * ext];
    var i0 = Math.max(0, Math.floor((Math.min(xs[0], xs[1]) - h - this.x0) / CEL)), i1 = Math.min(this.nx - 1, Math.ceil((Math.max(xs[0], xs[1]) + h - this.x0) / CEL));
    var j0 = Math.max(0, Math.floor((Math.min(ys[0], ys[1]) - h - this.y0) / CEL)), j1 = Math.min(this.ny - 1, Math.ceil((Math.max(ys[0], ys[1]) + h - this.y0) / CEL));
    for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
      var cx = this.x0 + (i + 0.5) * CEL - a[0], cy = this.y0 + (j + 0.5) * CEL - a[1];
      var t = cx * ux + cy * uy, n = Math.abs(-cx * uy + cy * ux);
      if (t >= -ext && t <= L + ext && n <= h) this.g[j * this.nx + i] = -1;
    }
  };
  Grade.prototype.encher = function (ini, val, limite) {
    var g = this.g, nx = this.nx, ny = this.ny, pilha = [ini], n = 0, borda = false;
    if (g[ini] !== 0) return { n: 0 };
    g[ini] = val;
    while (pilha.length) {
      var c = pilha.pop(); n++;
      var i = c % nx, j = (c - i) / nx;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) borda = true;
      if (limite && n > limite) { borda = true; }
      if (i > 0 && g[c - 1] === 0) { g[c - 1] = val; pilha.push(c - 1); }
      if (i < nx - 1 && g[c + 1] === 0) { g[c + 1] = val; pilha.push(c + 1); }
      if (j > 0 && g[c - nx] === 0) { g[c - nx] = val; pilha.push(c - nx); }
      if (j < ny - 1 && g[c + nx] === 0) { g[c + nx] = val; pilha.push(c + nx); }
    }
    return { n: n, borda: borda };
  };
  Grade.prototype.perimetro = function (val) {
    var g = this.g, nx = this.nx, e = 0;
    for (var c = 0; c < g.length; c++) if (g[c] === val) { var i = c % nx; if (i === 0 || g[c - 1] !== val) e++; if (i === nx - 1 || g[c + 1] !== val) e++; if (c < nx || g[c - nx] !== val) e++; if (c + nx >= g.length || g[c + nx] !== val) e++; }
    return e * CEL;
  };
  Grade.prototype.livreProximo = function (x, y) {
    var c = this.cel(x, y); if (c < 0) return -1;
    if (this.g[c] !== -1) return c;
    var nx = this.nx, i0 = c % nx, j0 = (c - i0) / nx;
    for (var r = 1; r <= 10; r++) for (var dj = -r; dj <= r; dj++) for (var di = -r; di <= r; di++) {
      var i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= nx || j >= this.ny) continue;
      if (this.g[j * nx + i] !== -1) return j * nx + i;
    }
    return -1;
  };
  function anguloDominante(paredes) {
    var h = {}, best = 0, bestK = 0;
    paredes.forEach(function (p) { var a = Math.atan2(p.y2 - p.y1, p.x2 - p.x1); a = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); var k = Math.round(a * 180 / Math.PI) % 90; h[k] = (h[k] || 0) + p.comprimento; if (h[k] > best) { best = h[k]; bestK = k; } });
    return bestK * Math.PI / 180;
  }

  /* ---------------------------------------------------------------- rótulos de ambiente */
  function rotulos(dx, cls, bbox) {
    var out = [];
    (dx.inserts || []).forEach(function (i) {
      var c = PC.deInsert(cls, i); if (c.classe !== "ambiente-rotulo") return;
      var nome = "", nivel = "";
      Object.keys(i.atribs || {}).forEach(function (k) { var kk = sa(k); if (/ambiente|room|^nome/.test(kk)) nome = nome || String(i.atribs[k]).trim(); else if (/elevacao|nivel/.test(kk)) nivel = i.atribs[k]; });
      if (nome && dentro(bbox, i.x, i.y)) out.push({ nome: nome, x: i.x, y: i.y, fonte: "atributo AMBIENTE do bloco «" + i.nome + "»", nivel: nivel });
    });
    (dx.textos || []).forEach(function (t) {
      var c = cls.camadas[t.layer]; if (!c || c.classe !== "ambiente-rotulo" || !dentro(bbox, t.x, t.y)) return;
      var s = sa(t.txt).trim(); if (!s || RE_NAO_AMB.test(s) || !RE_AMB.test(s) || /^\d/.test(s)) return;
      out.push({ nome: String(t.txt).trim(), x: t.x, y: t.y, fonte: "texto da camada «" + t.layer + "»" });
    });
    return out;
  }
  function niveisDe(dx, cls, bbox) {
    var vs = [];
    (dx.inserts || []).forEach(function (i) {
      if (!dentro(bbox, i.x, i.y)) return;
      var c = PC.deInsert(cls, i); if (c.classe !== "nivel" && c.classe !== "ambiente-rotulo") return;
      Object.keys(i.atribs || {}).forEach(function (k) { if (/^elevacao$|^nivel$/.test(sa(k))) { var v = num(i.atribs[k]); if (isFinite(v)) vs.push(Math.round(v * 100) / 100); } });
    });
    if (!vs.length) return null;
    var cont = {}, best = null; vs.forEach(function (v) { cont[v] = (cont[v] || 0) + 1; if (best === null || cont[v] > cont[best]) best = v; });
    return { cota: best, n: vs.length };
  }
  function peDireitoTexto(dx, bbox) {
    var achado = null;
    (dx.textos || []).forEach(function (t) {
      if (achado || !dentro(bbox, t.x, t.y, 2)) return;
      var m = /(?:p[eé][ .-]?direito|\bp\.?d\.?)\s*[:=]?\s*(\d+[.,]\d+)/i.exec(t.txt);
      if (m) { var v = parseFloat(m[1].replace(",", ".")); if (v >= 2.2 && v <= 6) achado = { v: v, txt: t.txt }; }
    });
    return achado;
  }

  /* ---------------------------------------------------------------- ler */
  function ler(dx, cls, opts) {
    opts = opts || {};
    if (!dx || !dx.segmentos) return { ok: false, erro: "DXF não lido." };
    /* resolvidos na CHAMADA, não só no carregamento: no navegador o grupo «bim» pode executar o planta3d.js depois
       deste arquivo (medido no e2e-proj-orcar: Planta3D chegou por último), e a referência do topo ficava nula */
    P3 = P3 || mod("Planta3D", "./planta3d.js"); PC = PC || mod("ProjClass", "./projclass.js"); Ler = Ler || mod("MorIfcLer", "./mor/ifcler.js");
    if (!P3 || !PC) return { ok: false, erro: "Motores de planta/classificação não carregaram." };
    cls = cls || PC.classificar(dx, { mem: opts.mem });
    var avisos = [], esc = conferirEscala(dx);
    if (esc.corrige !== 1) { escalar(dx, esc.corrige); }
    if (esc.nota) avisos.push(esc.nota);

    /* candidatos a parede: camada de parede (nome/geometria/memória) OU camada sem classe (desenho por pena: «Vs-0.05»…).
       Fora: o que a classificação já disse que NÃO é parede, e traço maior que 40 m (moldura de prancha). */
    var segParede = [], segsTodos = [];
    dx.segmentos.forEach(function (s) {
      var c = cls.camadas[s.layer]; s.classe = c ? c.classe : "";
      if (s.classe !== "mobiliario" && s.classe !== "carimbo" && s.classe !== "vegetacao" && s.classe !== "cota") segsTodos.push(s);
      if ((s.classe === "parede" || s.classe === "") && len(s) < 40) segParede.push(s);
    });
    var grupos = agrupar(segParede, opts.celVista || 1.5).filter(function (g) { return g.segs.length >= 8; });
    var tits = titulosDe(dx, cls);
    grupos.forEach(function (g) {
      var melhor = null, dMin = Infinity;
      tits.forEach(function (t) {
        if (t.x < g.bbox.x0 - 3 || t.x > g.bbox.x1 + 3) return;
        var d = t.y <= g.bbox.y0 ? g.bbox.y0 - t.y : (t.y <= g.bbox.y1 ? 0 : Infinity);
        if (d <= 12 && d < dMin) { dMin = d; melhor = t; }
      });
      g.titulo = melhor;
    });
    var temTitulo = grupos.some(function (g) { return !!g.titulo; });
    var vistas = grupos.map(function (g, ix) {
      var t = g.titulo ? sa(g.titulo.titulo) : "";
      var planta = g.titulo ? (RE_PLANTA.test(t) && !RE_NAO_PLANTA.test(t)) : (!temTitulo);
      return { id: "v" + (ix + 1), titulo: g.titulo ? g.titulo.titulo : "", escala: g.titulo ? g.titulo.escala : "", bbox: g.bbox, nSegs: g.segs.length, planta: planta, segs: g.segs, porque: g.titulo ? "título «" + g.titulo.titulo + "» (" + g.titulo.fonte + ")" + (planta ? ": planta de pavimento" : ": não é planta de pavimento") : (temTitulo ? "grupo de traços sem título por perto: fora" : "arquivo sem títulos: o grupo é uma planta") };
    });
    var plantas = vistas.filter(function (v) { return v.planta; });
    if (!plantas.length) avisos.push("nenhuma PLANTA de pavimento reconhecida no arquivo (" + vistas.length + " grupo(s) de paredes; títulos: " + vistas.map(function (v) { return v.titulo || "—"; }).join(", ") + ")");

    /* níveis e alturas */
    plantas.forEach(function (v, i) { v.nivel = niveisDe(dx, cls, v.bbox); v.nome = v.titulo || ("Pavimento " + (i + 1)); });
    var ordem = plantas.slice().sort(function (a, b) { return (a.nivel ? a.nivel.cota : 0) - (b.nivel ? b.nivel.cota : 0); });
    plantas.forEach(function (v) {
      var alt = opts.alturas && opts.alturas[v.nome];
      if (alt > 0) { v.altura = alt; v.alturaFonte = "projeto"; v.alturaPorque = "altura informada: " + fmt(alt) + " m"; return; }
      var pd = peDireitoTexto(dx, v.bbox);
      if (pd) { v.altura = pd.v; v.alturaFonte = "projeto"; v.alturaPorque = "texto do projeto «" + pd.txt + "»"; return; }
      var k = ordem.indexOf(v), prox = ordem[k + 1];
      if (v.nivel && prox && prox.nivel && prox.nivel.cota - v.nivel.cota >= 2.2 && prox.nivel.cota - v.nivel.cota <= 6) {
        v.altura = r2(prox.nivel.cota - v.nivel.cota); v.alturaFonte = "deduzido";
        v.alturaPorque = "diferença de níveis entre «" + v.nome + "» (" + fmt(v.nivel.cota) + ") e «" + prox.nome + "» (" + fmt(prox.nivel.cota) + "): altura PISO A PISO — desconte a laje se a alvenaria parar nela"; return;
      }
      v.altura = opts.peDireitoPadrao > 0 ? opts.peDireitoPadrao : PE_DIREITO_PADRAO; v.alturaFonte = "deduzido";
      v.alturaPorque = "o projeto não diz o pé-direito: padrão " + fmt(v.altura) + " m (DEDUZIDO — corrija se for outro)";
    });

    function camParede(L) { var c = cls.camadas[L]; return !!(c && c.classe === "parede"); }
    var elementos = [], espacos = [], naoUsados = { portaSemVao: 0, insercoesForaDePlanta: 0 }, plantaOut = [], seq = 0;
    var porInsert = (dx.inserts || []).map(function (ins) { return { ins: ins, c: PC.deInsert(cls, ins) }; });
    plantas.forEach(function (v) {
      var bb = v.bbox, fol = 0.5;
      var segV = segsTodos.filter(function (s) { return dentro(bb, s.x1, s.y1, fol) && dentro(bb, s.x2, s.y2, fol); });
      var paredeSegs = v.segs.filter(function (s) { return !s.curva; });
      var ff = P3.filtrarFamilias(paredeSegs, {});
      var det = P3.detectarParedes(ff.segmentos, { espMin: 0.06, espMax: 0.40 });
      var paredes = det.paredes.filter(function (p) { return p.ligada !== false; }).map(function (p) { return { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, comprimento: p.comprimento, espessura: p.espessura, layer: p.layer, confianca: p.confianca }; });
      var nPilares = det.paredes.length - paredes.length;
      var insV = porInsert.filter(function (it) { var x = it.ins.cx != null ? it.ins.cx : it.ins.x, y = it.ins.cy != null ? it.ins.cy : it.ins.y; return dentro(bb, x, y, fol); });
      var vs = vaos(paredes, { segs: segV, insercoes: insV });

      /* recintos */
      var ang = anguloDominante(paredes), G = new Grade(bb, ang);
      paredes.forEach(function (p) { G.parede(p); });
      for (var bi = 0; bi < G.nx; bi++) { G.encher(bi, -2); G.encher((G.ny - 1) * G.nx + bi, -2); }
      for (var bj = 0; bj < G.ny; bj++) { G.encher(bj * G.nx, -2); G.encher(bj * G.nx + G.nx - 1, -2); }
      var rots = rotulos(dx, cls, bb), ambs = [];
      rots.forEach(function (rt) {
        var c = G.livreProximo(rt.x, rt.y), id = "amb" + (++seq);
        var amb = { id: id, nome: rt.nome, pavimento: v.nome, x: rt.x, y: rt.y, categoria: Ler && Ler.ambienteCat ? Ler.ambienteCat(rt.nome) || "seco" : "seco", fonteRotulo: rt.fonte, altura: v.altura };
        if (c < 0) { amb.pendente = "o rótulo caiu fora da grade da planta"; ambs.push(amb); return; }
        var val = G.g[c];
        if (val === -2) { amb.pendente = "o contorno das paredes não fecha em volta do rótulo (vazou para fora): falta parede reconhecida ou há vão maior que " + fmt(VAO_MAX) + " m"; ambs.push(amb); return; }
        if (val > 0) { var outro = ambs.filter(function (a) { return a.val === val; })[0]; if (outro) { outro.nome = outro.nome + " / " + rt.nome; outro.porqueNome = "dois rótulos no mesmo recinto"; } return; }
        amb.val = ambs.length + 1;
        var r = G.encher(c, amb.val);
        amb.areaPiso = r3(r.n * CEL * CEL); amb.perimetroPiso = r2(G.perimetro(amb.val));
        amb.porque = "recinto reconstruído pelo contorno das paredes (grade de " + Math.round(CEL * 100) + " cm): " + fmt(amb.areaPiso) + " m², perímetro " + fmt(amb.perimetroPiso) + " m; rótulo: " + rt.fonte;
        ambs.push(amb);
      });
      /* recintos fechados SEM rótulo: entram como ambiente sem nome (deduzido) — sem pergunta; ≥ 2 m² (menor é pilar/shaft) */
      if (opts.recintosSemNome !== false) {
        var nSem = 0;
        for (var cc = 0; cc < G.g.length; cc++) {
          if (G.g[cc] !== 0) continue;
          var vv2 = ambs.length + 1, rr = G.encher(cc, vv2), area2 = rr.n * CEL * CEL;
          if (rr.borda || area2 < 2) { continue; }
          nSem++;
          ambs.push({ id: "amb" + (++seq), nome: "Ambiente sem nome " + nSem, pavimento: v.nome, x: null, y: null, categoria: "seco", altura: v.altura, val: vv2, semNome: true,
            areaPiso: r3(area2), perimetroPiso: r2(G.perimetro(vv2)),
            porque: "recinto fechado pelas paredes SEM rótulo de ambiente no desenho: " + fmt(area2) + " m² (nome e uso DEDUZIDOS como seco — confira)" });
        }
      }
      ambs.forEach(function (a) {
        var e = { id: a.id, nome: a.nome, categoria: a.categoria, pavimento: a.pavimento, altura: a.altura, fonte: a.pendente ? "pendente" : "estimado", semNome: !!a.semNome, porque: a.pendente || a.porque, x: a.x, y: a.y };
        if (!a.pendente) { e.areaPiso = a.areaPiso; e.perimetroPiso = a.perimetroPiso; }
        else e.pendente = a.pendente;
        if (a.val) e._val = a.val;
        espacos.push(e);
      });
      function ambEm(x, y) {
        var c = G.cel(x, y); if (c < 0) return null; var val = G.g[c];
        if (val === -2) return "ext"; if (val <= 0) return null;
        for (var i = 0; i < ambs.length; i++) if (ambs[i].val === val) return ambs[i]; return null;
      }

      /* paredes → elementos */
      paredes.forEach(function (p) {
        var id = "par" + (++seq), dxp = p.x2 - p.x1, dyp = p.y2 - p.y1, L = Math.sqrt(dxp * dxp + dyp * dyp), nx = -dyp / L, ny = dxp / L, d = p.espessura / 2 + 0.12;
        var faces = [], ext = false, ambsP = [];
        [0.25, 0.5, 0.75].forEach(function (f) {
          var px = p.x1 + dxp * f, py = p.y1 + dyp * f;
          [1, -1].forEach(function (sg) { var a = ambEm(px + nx * d * sg, py + ny * d * sg); if (a === "ext") ext = true; else if (a && ambsP.indexOf(a) < 0) ambsP.push(a); });
        });
        var vaosE = (p.vaos || []).filter(function (vv) { return vv.tipo !== "passagem"; }).map(function (vv) { var h = vv.tipo === "porta" ? H_PORTA : H_JANELA; return { area: r3(vv.largura * h), largura: r3(vv.largura), classe: vv.tipo === "porta" ? "IFCDOOR" : "IFCWINDOW", altura: h }; });
        var passagens = (p.vaos || []).filter(function (vv) { return vv.tipo === "passagem"; });
        var Lliq = p.comprimento - passagens.reduce(function (s, vv) { return s + vv.largura; }, 0);
        elementos.push({
          id: id, classe: "DXF-PAREDE", nome: "Parede " + Math.round(p.espessura * 100) + " cm", tipoNome: "", papel: "parede-alvenaria", disciplina: "arquitetura", sub: "", regra: "pares paralelos na camada «" + p.layer + "»",
          qto: { comprimento: r3(Lliq), largura: r3(p.espessura), altura: v.altura }, qtoFonte: { comprimento: camParede(p.layer) ? "dxf" : "estimado", largura: camParede(p.layer) ? "dxf" : "estimado", altura: v.alturaFonte === "projeto" ? "dxf" : "estimado" },
          vaos: vaosE, ambientes: ambsP.map(function (a) { return a.id; }), ambientesCat: ambsP.map(function (a) { return a.categoria; }), externo: ext ? true : (ambsP.length >= 2 ? false : null),
          camadas: [], materiais: [], psets: {}, pavimento: v.nome, geo: { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 },
          porque: (camParede(p.layer) ? "" : "DEDUZIDA (a camada «" + p.layer + "» não é de alvenaria pelo nome; pode ser mobiliário/escada — confira) · ") + "parede: duas faces paralelas a " + Math.round(p.espessura * 100) + " cm na camada «" + p.layer + "», " + fmt(Lliq) + " m" + (passagens.length ? " (descontadas " + passagens.length + " passagem(ns) livre(s))" : "") + "; altura " + fmt(v.altura) + " m — " + v.alturaPorque + (vaosE.length ? "; " + vaosE.length + " vão(s) dentro" : "")
        });
        (p.vaos || []).forEach(function (vv) {
          if (vv.tipo === "passagem") return;
          var cx = (vv.x1 + vv.x2) / 2, cy = (vv.y1 + vv.y2) / 2, as = [];
          [1, -1].forEach(function (sg) { var a = ambEm(cx + vv.nx * d * sg, cy + vv.ny * d * sg); if (a && a !== "ext" && as.indexOf(a) < 0) as.push(a); });
          var extV = [1, -1].some(function (sg) { return ambEm(cx + vv.nx * d * sg, cy + vv.ny * d * sg) === "ext"; });
          var tag = null, dt = 2;
          insV.forEach(function (it) { if (it.c.classe === vv.tipo && it.c.sub === "etiqueta") { var dd = Math.sqrt(Math.pow(it.ins.x - cx, 2) + Math.pow(it.ins.y - cy, 2)); if (dd < dt) { dt = dd; tag = it; } } });
          var nomeT = tag ? (tag.ins.atribs[Object.keys(tag.ins.atribs)[0]] || "") : "";
          elementos.push({
            id: (vv.tipo === "porta" ? "por" : "jan") + (++seq), classe: vv.tipo === "porta" ? "IFCDOOR" : "IFCWINDOW", nome: (vv.tipo === "porta" ? "Porta " : "Janela ") + Math.round(vv.largura * 100) + (nomeT ? " (" + nomeT + ")" : ""), tipoNome: nomeT, papel: vv.tipo, disciplina: "arquitetura", sub: "",
            qto: { largura: r3(vv.largura), altura: vv.tipo === "porta" ? H_PORTA : H_JANELA }, qtoFonte: { largura: "dxf", altura: "estimado" },
            ambientes: as.map(function (a) { return a.id; }), ambientesCat: as.map(function (a) { return a.categoria; }).concat(extV ? ["externo"] : []), externo: extV,
            camadas: [], materiais: [], psets: {}, pavimento: v.nome, hospedeiro: id, geo: { x1: vv.x1, y1: vv.y1, x2: vv.x2, y2: vv.y2 },
            porque: vv.tipo + ": vão de " + fmt(vv.largura) + " m entre dois trechos de parede (" + vv.porque + "); altura " + fmt(vv.tipo === "porta" ? H_PORTA : H_JANELA) + " m PADRÃO (deduzida)" + (nomeT ? "; etiqueta «" + nomeT + "»" : "")
          });
        });
      });

      /* inserções: louças, metais, elétrica (uma por posição) */
      var vistos = {};
      insV.forEach(function (it) {
        var c = it.c, sub = c.sub || "", papel = "";
        if (c.classe === "louca" || c.classe === "metal") papel = sub ? "louca" : "";
        else if (c.classe === "eletrica" && /^(tomada|interruptor|luminaria|quadro)$/.test(sub)) papel = sub === "quadro" ? "quadro-eletrico" : sub;
        else if (c.classe === "porta" && sub !== "etiqueta" && !it.usado) { naoUsados.portaSemVao++; return; }
        if (!papel) return;
        var x = it.ins.cx != null ? it.ins.cx : it.ins.x, y = it.ins.cy != null ? it.ins.cy : it.ins.y;
        var k = papel + sub + "|" + Math.round(x * 20) + "|" + Math.round(y * 20); if (vistos[k]) return; vistos[k] = 1;
        var a = ambEm(x, y), amb = a && a !== "ext" ? a : null;
        elementos.push({
          id: "ins" + (++seq), classe: "DXF-BLOCO", nome: it.ins.nome, tipoNome: it.ins.nome, papel: papel, disciplina: papel === "louca" ? "hidro" : "eletrica", sub: papel === "tomada" ? "10A" : sub,
          qto: {}, qtoFonte: {}, ambientes: amb ? [amb.id] : [], ambientesCat: amb ? [amb.categoria] : [], externo: a === "ext" ? true : null,
          camadas: [], materiais: [], psets: {}, pavimento: v.nome, geo: { x: x, y: y, rot: it.ins.rot, w: it.ins.w, h: it.ins.h, bloco: it.ins.nome, layer: it.ins.layer },
          porque: (papel === "louca" ? (c.classe === "metal" ? "metal" : "louça") + " (" + sub + ")" : papel) + ": " + c.regra + (amb ? "; no ambiente «" + amb.nome + "»" : "")
        });
      });
      plantaOut.push({ vista: v.id, nome: v.nome, titulo: v.titulo, escala: v.escala, altura: v.altura, alturaFonte: v.alturaFonte, alturaPorque: v.alturaPorque, bbox: bb, nivel: v.nivel, paredes: paredes.map(function (p) { return { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, espessura: p.espessura }; }), vaos: vs, pilaresProvaveis: nPilares, escadaDescartada: ff.removidos || 0, stats: det.stats });
    });
    naoUsados.insercoesForaDePlanta = porInsert.filter(function (it) { return (it.c.classe === "louca" || it.c.classe === "metal") && !plantas.some(function (v) { return dentro(v.bbox, it.ins.x, it.ins.y, 0.5); }); }).length;
    if (naoUsados.insercoesForaDePlanta) avisos.push(naoUsados.insercoesForaDePlanta + " louça(s)/metal(is) fora das plantas de pavimento (cortes, detalhes, fachadas): não contados");
    if (naoUsados.portaSemVao) avisos.push(naoUsados.portaSemVao + " bloco(s) de porta sem vão de parede reconhecido: não contados como porta (confira)");
    var Lp = 0, LpCam = 0; elementos.forEach(function (e) { if (e.papel === "parede-alvenaria") { Lp += e.qto.comprimento; if (e.qtoFonte.comprimento === "dxf") LpCam += e.qto.comprimento; } });
    if (Lp > 0 && LpCam < 0.2 * Lp) avisos.push("só " + Math.round(LpCam) + " de " + Math.round(Lp) + " m de parede vieram de camada de ALVENARIA; o resto saiu de pares paralelos em camadas sem nome (mobiliário, escada, bancada podem ter entrado): paredes DEDUZIDAS, confira — o arquivo pode não ter as paredes desenhadas");
    if (plantas.length && !Lp) avisos.push("nenhuma parede reconhecida nas plantas: o arquivo não traz as paredes como linhas (referência externa não vinculada?)");
    var pend = espacos.filter(function (e) { return e.pendente; }).length;
    if (pend) avisos.push(pend + " ambiente(s) com recinto pendente (contorno não fecha)");
    espacos.forEach(function (e) { delete e._val; });

    return {
      ok: true, fonte: "dxf", elementos: elementos, espacos: espacos,
      modelo: { pavimentos: plantas.map(function (v) { return { nome: v.nome, cota: v.nivel ? v.nivel.cota : null, altura: v.altura, alturaFonte: v.alturaFonte }; }) },
      vistas: vistas.map(function (v) { return { id: v.id, titulo: v.titulo, escala: v.escala, planta: v.planta, nSegs: v.nSegs, bbox: v.bbox, porque: v.porque }; }),
      plantas: plantaOut, escala: esc, avisos: avisos, naoUsados: naoUsados,
      naoReconhecidos: cls.naoReconhecidos, classificacao: cls.resumo,
      cobertura: { fonte: "dxf", elementos: elementos.length, ambientes: espacos.length }
    };
  }

  var ProjLer = { ler: ler, conferirEscala: conferirEscala, _agrupar: agrupar, _vaos: vaos, PE_DIREITO_PADRAO: PE_DIREITO_PADRAO };
  global.ProjLer = ProjLer;
  if (typeof module !== "undefined" && module.exports) module.exports = ProjLer;
})(typeof window !== "undefined" ? window : globalThis);

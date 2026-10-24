/* =====================================================================
 * pranchaviva.js — PRANCHA VIVA: a folha e o 3D são o mesmo projeto (motor PURO, ES5, sem DOM, sem THREE).
 *
 * Pedido do Rogério (21/10/2026, "onde encontro no sistema"): a demonstração do site virou comando do app. Tocar num
 * ponto da prancha (planta, corte, fachada) leva à MESMA posição no 3D; no 3D, voltar leva ao mesmo ponto da folha.
 *
 * ⚠ A LIGAÇÃO FOLHA → MODELO SAI DA PRÓPRIA VISTA QUE GEROU O DESENHO, NUNCA DE CHUTE. Três origens:
 *   1. VIEWPORT (vista 2D em escala, js/bimfolhaui.js): o desenho do BIM.vista2d vem em coordenadas de TELA em metros
 *      (X à direita, Y para baixo) — planta: X = x do mundo, Y = z; corte: X ao longo de A→B (com o `inv`), Y = −y.
 *      O bloco põe o viewBox do desenho no quadro (preserveAspectRatio xMidYMid meet, js/pranchaui.js viewportSvg).
 *      `planoDaVista` + `ligacaoViewport` refazem as DUAS contas (a do vista2d e a do encaixe) — o teste confere
 *      contra uma cópia independente da conta do js/bim.js (produto vetorial, não a fórmula simplificada daqui).
 *   2. PONTO DE VISTA fotografado (bloco "vista"): a foto sai da câmera gravada, na proporção do quadro
 *      (js/gestao.js _prFotografarVistas). O ponto da folha vira um RAIO dessa câmera; quem acha a peça é o raycast
 *      do modelo (a tela). A volta é a projeção pela mesma câmera.
 *   3. FOLHA PRONTA COM MATRIZ (`folha.pv`: o pranchas.json do gerador de pranchas, pixel → IFC). O IFC é Z para cima
 *      e a cena é Y para cima: a conta usa a matriz de coordenação que o web-ifc aplicou (BIM._coordMatriz); sem ela,
 *      a permutação padrão (X, Z, −Y).
 * Folha sem nenhuma das três (imagem solta, PDF importado sem matriz) NÃO é ligada: a tela diz isso e oferece o
 *   caminho (pôr a vista do modelo na folha).
 *
 * UNIDADES: folha em MILÍMETROS de papel (x para a direita, y para baixo, origem no canto de cima à esquerda, a
 *   mesma do js/prancha.js); mundo em METROS da cena (Y para cima).
 * Teste: node tools/test-pranchaviva.js (ida e volta < 1 cm, com controle negativo).
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { var n = Number(v); return (v != null && v !== "" && isFinite(n)) ? n : d; }
  function arr(a) { return Object.prototype.toString.call(a) === "[object Array]" ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function v3(x, y, z) { return [x, y, z]; }
  function soma(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function esc(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norma(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = norma(a); return l > 1e-12 ? esc(a, 1 / l) : [0, 0, 0]; }
  function vetOk(a) { return arr(a).length === 3 && isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2]); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  var PV = {
    VERSAO: 1,

    /* ==================================================================
     * 1. O PLANO DA VISTA 2D (a mesma conta do BIM.vista2d, js/bim.js)
     * Entrada: a definição do Bim2D (js/bim2dui.js def/_p6Def).
     * Saída: { tipo, base, ex, ey, n, cota? } com
     *   mundo = base + X·ex + Y·ey   (X, Y = coordenadas do desenho, em metros)
     *   n = para onde a vista OLHA (o lado do modelo que a folha mostra)
     * ================================================================== */
    planoDaVista: function (d) {
      d = d || {};
      var ehCorte = d.tipo === "corte" || d.tipo === "elevacao" || !!(d.corte && d.tipo !== "planta");
      if (!ehCorte) {
        var nv = d.nivel || {}, yc = num(nv.y, NaN) + num(d.altura, 1.2);
        if (!isFinite(yc)) return null;
        var forro = d.p6 === "forro" || d.p6base === "forro";
        /* planta: câmera olhando para BAIXO (dir 0,−1,0), "cima" da tela = −z → X = x, Y = z.
           forro: olha para CIMA, mas o vista2d devolve o X espelhado de volta (o forro "refletido" é desenhado como a
           planta) → a mesma conta de X e Y; só o lado visível muda. */
        return { tipo: forro ? "forro" : "planta", base: v3(0, yc, 0), ex: v3(1, 0, 0), ey: v3(0, 0, 1), n: forro ? v3(0, 1, 0) : v3(0, -1, 0), cota: yc };
      }
      var c = d.corte || d.linha || {};
      var ax = num(c.ax, NaN), az = num(c.az, NaN), bx = num(c.bx, NaN), bz = num(c.bz, NaN);
      if (!isFinite(ax) || !isFinite(az) || !isFinite(bx) || !isFinite(bz)) return null;
      var dx = bx - ax, dz = bz - az, L = Math.sqrt(dx * dx + dz * dz);
      if (!(L > 0.05)) return null;
      var nx = dz / L, nz = -dx / L;
      if (c.inv) { nx = -nx; nz = -nz; }
      /* r = dir × up(0,1,0) = (−nz, 0, nx): sem o `inv` é A→B; com ele, B→A (o X do desenho anda ao contrário) */
      return { tipo: d.p6 === "elevacao" || d.tipo === "elevacao" ? "fachada" : "corte", base: v3(ax, 0, az), ex: v3(-nz, 0, nx), ey: v3(0, -1, 0), n: v3(nx, 0, nz),
        A: [ax, az], B: [bx, bz] };
    },

    /* ==================================================================
     * 2. O BLOCO NA FOLHA: o encaixe do viewBox (meet, centrado)
     * ================================================================== */
    encaixe: function (b, vb) {
      b = b || {}; vb = vb || {};
      var bw = num(b.w, 0), bh = num(b.h, 0), vw = num(vb.w, 0), vh = num(vb.h, 0);
      if (!(bw > 0 && bh > 0 && vw > 0 && vh > 0)) return null;
      var k = Math.min(bw / vw, bh / vh);   /* mm de papel por metro do desenho */
      return { k: k, ox: num(b.x, 0) + (bw - vw * k) / 2, oy: num(b.y, 0) + (bh - vh * k) / 2, vb: { x: num(vb.x, 0), y: num(vb.y, 0), w: vw, h: vh } };
    },
    /* o viewBox que a folha usa: o recorte do bloco (metros do desenho) ou o do desenho inteiro */
    vbDoBloco: function (b, vbDesenho) {
      var r = b && b.recorte;
      if (r && isFinite(+r.x0) && isFinite(+r.y0) && isFinite(+r.x1) && isFinite(+r.y1) && +r.x1 > +r.x0 && +r.y1 > +r.y0) return { x: +r.x0, y: +r.y0, w: +r.x1 - +r.x0, h: +r.y1 - +r.y0 };
      return vbDesenho || null;
    },

    /* a ligação de um VIEWPORT: a matriz afim mm → mundo (3 linhas × [mm x, mm y, 1]) */
    ligacaoViewport: function (b, vb, plano, extra) {
      if (!b || !plano) return null;
      var E = this.encaixe(b, vb); if (!E) return null;
      var k = E.k, B = plano.base, ex = plano.ex, ey = plano.ey;
      /* mundo_i = B_i + ex_i·(vb.x + (x − ox)/k) + ey_i·(vb.y + (y − oy)/k) */
      var M = [0, 1, 2].map(function (i) {
        return [ex[i] / k, ey[i] / k, B[i] + ex[i] * (E.vb.x - E.ox / k) + ey[i] * (E.vb.y - E.oy / k)];
      });
      var o = { tipo: "plano", origem: "viewport", vista: plano.tipo, M: M, n: plano.n.slice(), rect: { x: num(b.x, 0), y: num(b.y, 0), w: num(b.w, 0), h: num(b.h, 0) },
        mmPorM: k, cota: plano.cota != null ? plano.cota : null, vb: E.vb, enc: { k: k, ox: E.ox, oy: E.oy } };
      extra = extra || {};
      Object.keys(extra).forEach(function (kk) { o[kk] = extra[kk]; });
      return o;
    },

    /* ==================================================================
     * 3. FOLHA PRONTA COM MATRIZ (pranchas.json: pixel → IFC)
     *   pv = { m: [[a,b,c],[d,e,f],[g,h,i]] (pixel → IFC metros), w, h (px), dpi, papel_mm: [W, H],
     *          tipo: planta|corte|fachada, eixos: { d_olhar: [IFC] }, cota_corte, cota_piso, titulo, ambientes }
     *   C = a matriz IFC → cena (16 números, coluna a coluna, como o web-ifc/THREE guardam) ou null
     * ================================================================== */
    ifcParaCena: function (C, p) {
      if (arr(C).length === 16 && C.every(function (x) { return isFinite(+x); })) {
        return [C[0] * p[0] + C[4] * p[1] + C[8] * p[2] + C[12], C[1] * p[0] + C[5] * p[1] + C[9] * p[2] + C[13], C[2] * p[0] + C[6] * p[1] + C[10] * p[2] + C[14]];
      }
      return [p[0], p[2], -p[1]];   /* a permutação do web-ifc sem COORDINATE_TO_ORIGIN: Z para cima → Y para cima */
    },
    _dirIfcParaCena: function (C, d) {
      var o = this.ifcParaCena(C, [0, 0, 0]), q = this.ifcParaCena(C, d);
      return sub(q, o);
    },
    normPv: function (pv) {
      if (!pv || typeof pv !== "object") return null;
      var m = arr(pv.m);
      if (m.length !== 3 || !m.every(function (l) { return arr(l).length === 3 && l.every(function (x) { return isFinite(+x); }); })) return null;
      var w = num(pv.w, 0), h = num(pv.h, 0), dpi = num(pv.dpi, 0);
      if (!(w > 0 && h > 0 && dpi > 0)) return null;
      var pap = arr(pv.papel_mm || pv.papelMm);
      var eix = pv.eixos || {}, dol = arr(eix.d_olhar);
      return {
        m: m.map(function (l) { return l.map(Number); }), w: w, h: h, dpi: dpi,
        papelMm: pap.length === 2 && +pap[0] > 0 && +pap[1] > 0 ? [+pap[0], +pap[1]] : [w * 25.4 / dpi, h * 25.4 / dpi],
        tipo: /^(planta|corte|fachada)$/.test(txt(pv.tipo)) ? txt(pv.tipo) : "planta",
        olhar: dol.length === 3 && dol.every(function (x) { return isFinite(+x); }) ? dol.map(Number) : null,
        cotaCorte: num(pv.cota_corte != null ? pv.cota_corte : pv.cotaCorte, null), cotaPiso: num(pv.cota_piso != null ? pv.cota_piso : pv.cotaPiso, null),
        titulo: txt(pv.titulo).slice(0, 120), pavimento: txt(pv.pavimento).slice(0, 80),
        ambientes: arr(pv.ambientes).slice(0, 400).filter(function (a) { return a && arr(a.xy).length >= 2 && isFinite(+a.xy[0]) && isFinite(+a.xy[1]); })
          .map(function (a) { return { nome: txt(a.nome).slice(0, 80), area: num(a.area, 0), xy: [+a.xy[0], +a.xy[1]] }; })
      };
    },
    /* o pranchas.json nos DOIS formatos do gerador: o da demonstração ({pranchas:[{m, w, h, dpi, img…}]}) e o
       bruto ({desenhos:[{folha_a1:{pixel_para_modelo_4x3, png_largura_px…}, arquivos:{folha_png}…}]}). Do bruto vale a
       matriz da FOLHA A1 (a imagem da folha inteira), nunca a do desenho solto — são imagens diferentes. */
    pranchasDoJson: function (d) {
      d = d || {};
      if (arr(d.pranchas).length) return arr(d.pranchas);
      return arr(d.desenhos).map(function (x) {
        var fa = x && x.folha_a1, m4 = fa && arr(fa.pixel_para_modelo_4x3), arq = (x && x.arquivos) || {};
        if (!fa || m4.length < 3 || !arq.folha_png) return null;
        var ex = x.eixos_da_vista || {};
        return { id: txt(x.id), folha: num(x.folha, 0), tipo: txt(x.tipo), titulo: txt(x.titulo), img: txt(arq.folha_png), w: num(fa.png_largura_px, 0), h: num(fa.png_altura_px, 0),
          dpi: num(fa.dpi, 0), papel_mm: arr(fa.papel_mm), m: m4.slice(0, 3), eixos: { d_olhar: arr(ex.d_olhar) }, cota_corte: x.cota_corte_z_m, cota_piso: x.cota_piso_m, pavimento: txt(x.pavimento),
          ambientes: arr(x.ambientes).map(function (a) { return { nome: a && a.nome, area: a && (a.area_m2 != null ? a.area_m2 : a.area), xy: a && (a.rotulo_xy_modelo || a.xy) }; }) };
      }).filter(Boolean);
    },
    ligacaoMatriz: function (pv, C, extra) {
      var p = this.normPv(pv); if (!p) return null;
      var self = this, kpx = p.dpi / 25.4;   /* px por mm de papel */
      /* mm → px (× kpx) → IFC (m) → cena (C): três afins compostas numa só */
      var origem = this.ifcParaCena(C, [p.m[0][2], p.m[1][2], p.m[2][2]]);
      var cx = this._dirIfcParaCena(C, [p.m[0][0] * kpx, p.m[1][0] * kpx, p.m[2][0] * kpx]);
      var cy = this._dirIfcParaCena(C, [p.m[0][1] * kpx, p.m[1][1] * kpx, p.m[2][1] * kpx]);
      var M = [0, 1, 2].map(function (i) { return [cx[i], cy[i], origem[i]]; });
      var n = p.olhar ? unit(this._dirIfcParaCena(C, p.olhar)) : unit(cruz(cx, cy));
      if (!p.olhar && p.tipo === "planta" && n[1] > 0) n = esc(n, -1);   /* planta olha para baixo */
      var cota = p.cotaCorte != null ? this.ifcParaCena(C, [0, 0, p.cotaCorte])[1] : null;
      var o = { tipo: "plano", origem: "matriz", vista: p.tipo, M: M, n: n, rect: { x: 0, y: 0, w: p.papelMm[0], h: p.papelMm[1] },
        mmPorM: 1 / Math.max(1e-9, norma(cy)), cota: p.tipo === "planta" ? cota : null, pv: p };
      o.ambientes = p.ambientes.map(function (a) {
        var z = p.cotaCorte != null ? p.cotaCorte : 0, P = self.ifcParaCena(C, [a.xy[0], a.xy[1], z]), mm = self.paraPapel(o, P);
        return { nome: a.nome, area: a.area, x: mm.x, y: mm.y, mundo: P };
      });
      extra = extra || {};
      Object.keys(extra).forEach(function (kk) { o[kk] = extra[kk]; });
      return o;
    },

    /* ==================================================================
     * 4. PONTO DE VISTA FOTOGRAFADO: a câmera gravada (pos, alvo, up, fov vertical em graus)
     * ================================================================== */
    ligacaoCamera: function (b, cam, extra) {
      if (!b || !cam || !vetOk(cam.pos) || !vetOk(cam.alvo)) return null;
      var bw = num(b.w, 0), bh = num(b.h, 0); if (!(bw > 0 && bh > 0)) return null;
      var f = sub(cam.alvo, cam.pos); if (norma(f) < 1e-6) return null;
      var o = { tipo: "camera", origem: "vista", rect: { x: num(b.x, 0), y: num(b.y, 0), w: bw, h: bh },
        cam: { pos: cam.pos.slice(), alvo: cam.alvo.slice(), up: vetOk(cam.up) ? cam.up.slice() : [0, 1, 0], fov: clamp(num(cam.fov, 50), 5, 150), orto: !!cam.orto },
        aspecto: bw / bh };
      extra = extra || {};
      Object.keys(extra).forEach(function (kk) { o[kk] = extra[kk]; });
      return o;
    },
    _baseCamera: function (lig) {
      var c = lig.cam, f = unit(sub(c.alvo, c.pos)), r = unit(cruz(f, c.up));
      if (norma(r) < 1e-9) r = unit(cruz(f, Math.abs(f[1]) < 0.9 ? [0, 1, 0] : [0, 0, -1]));
      var u = cruz(r, f), t = Math.tan(c.fov * Math.PI / 360);
      return { f: f, r: r, u: u, t: t };
    },
    /* o raio da câmera que passa pelo ponto (mm) da foto */
    raioDoPapel: function (lig, x, y) {
      if (!lig || lig.tipo !== "camera") return null;
      var R = lig.rect, nx = ((x - R.x) / R.w) * 2 - 1, ny = -(((y - R.y) / R.h) * 2 - 1), B = this._baseCamera(lig);
      var d = unit(soma(soma(B.f, esc(B.r, nx * B.t * lig.aspecto)), esc(B.u, ny * B.t)));
      return { origem: lig.cam.pos.slice(), dir: d };
    },
    /* a volta: o ponto do mundo na foto (mm); `frente` falso = atrás da câmera */
    cameraParaPapel: function (lig, P) {
      var B = this._baseCamera(lig), v = sub(P, lig.cam.pos), z = dot(v, B.f);
      if (!(z > 1e-6)) return { x: NaN, y: NaN, frente: false };
      var nx = dot(v, B.r) / (z * B.t * lig.aspecto), ny = dot(v, B.u) / (z * B.t), R = lig.rect;
      return { x: R.x + (nx + 1) / 2 * R.w, y: R.y + (1 - ny) / 2 * R.h, frente: true, dentro: Math.abs(nx) <= 1 && Math.abs(ny) <= 1 };
    },

    /* ==================================================================
     * 5. IDA E VOLTA NUM PLANO
     * ================================================================== */
    doPapel: function (lig, x, y) {
      if (!lig || lig.tipo !== "plano") return null;
      var M = lig.M;
      return [M[0][0] * x + M[0][1] * y + M[0][2], M[1][0] * x + M[1][1] * y + M[1][2], M[2][0] * x + M[2][1] * y + M[2][2]];
    },
    /* o ponto do mundo PROJETADO na folha ao longo do olhar (mínimos quadrados: serve também à matriz que não é
       ortonormal); `prof` = quanto o ponto está além do plano, no sentido em que a vista olha */
    paraPapel: function (lig, P) {
      if (!lig) return { x: NaN, y: NaN };
      if (lig.tipo === "camera") return this.cameraParaPapel(lig, P);
      var M = lig.M, a = [M[0][0], M[1][0], M[2][0]], b = [M[0][1], M[1][1], M[2][1]], c = [M[0][2], M[1][2], M[2][2]], q = sub(P, c);
      var aa = dot(a, a), ab = dot(a, b), bb = dot(b, b), det = aa * bb - ab * ab;
      if (!(Math.abs(det) > 1e-18)) return { x: NaN, y: NaN };
      var qa = dot(q, a), qb = dot(q, b), x = (bb * qa - ab * qb) / det, y = (aa * qb - ab * qa) / det;
      var R = lig.rect || { x: -Infinity, y: -Infinity, w: Infinity, h: Infinity };
      return { x: x, y: y, prof: dot(sub(P, this.doPapel(lig, x, y)), lig.n || [0, 0, 0]), dentro: x >= R.x && y >= R.y && x <= R.x + R.w && y <= R.y + R.h };
    },

    /* a ligação no ponto da folha: o quadro MENOR que contém o ponto (viewport dentro de outro, ou o detalhe por cima da
       folha com matriz). Ponto de vista perde para plano no empate (o plano é exato; a foto depende do raycast). */
    ligacaoEm: function (ligs, x, y) {
      var dentro = arr(ligs).filter(function (l) { var R = l && l.rect; return R && x >= R.x && y >= R.y && x <= R.x + R.w && y <= R.y + R.h; });
      dentro.sort(function (a, b) { var d = a.rect.w * a.rect.h - b.rect.w * b.rect.h; if (Math.abs(d) > 1e-6) return d; return (a.tipo === "plano" ? 0 : 1) - (b.tipo === "plano" ? 0 : 1); });
      return dentro[0] || null;
    },

    /* ==================================================================
     * 6. CÂMERAS DA TRANSIÇÃO (esféricas em torno do alvo, como o OrbitControls: phi a partir do +Y)
     * ================================================================== */
    /* a câmera que mostra o plano da folha exatamente como a tela mostra a folha:
       `centro` = o ponto da folha (mm) no centro do canvas; `pxPorMm` = a escala da folha na tela; `alturaPx` = a do canvas */
    camDaFolha: function (lig, centro, pxPorMm, alturaPx, fovGraus) {
      if (!lig || lig.tipo !== "plano") return null;
      var alvo = this.doPapel(lig, centro.x, centro.y), fov = num(fovGraus, 45) * Math.PI / 180;
      var mPorPx = 1 / (num(pxPorMm, 1) * lig.mmPorM);
      var dist = (num(alturaPx, 600) * mPorPx) / 2 / Math.tan(fov / 2);
      var n = lig.n, pos = sub(alvo, esc(n, dist));
      /* o "para cima" da folha (−y do papel) no mundo: a planta põe o norte do modelo para cima; o corte, o +Y */
      var cima = unit(esc([lig.M[0][1], lig.M[1][1], lig.M[2][1]], -1));
      return { alvo: alvo, pos: pos, cima: cima, dist: dist };
    },
    esferico: function (alvo, pos) {
      var o = sub(pos, alvo), r = norma(o);
      if (!(r > 1e-9)) return { alvo: alvo.slice(), r: 1e-3, phi: 0.0001, theta: 0 };
      return { alvo: alvo.slice(), r: r, phi: Math.acos(clamp(o[1] / r, -1, 1)), theta: Math.atan2(o[0], o[2]) };
    },
    posDe: function (e) {
      var s = Math.sin(e.phi);
      return [e.alvo[0] + e.r * s * Math.sin(e.theta), e.alvo[1] + e.r * Math.cos(e.phi), e.alvo[2] + e.r * s * Math.cos(e.theta)];
    },
    /* a planta vista de cima com o norte para cima: theta tal que a câmera fique do lado −(cima) (o OrbitControls
       com up = +Y só fica "em pé" assim); phi nunca 0 (a conta da câmera degenera) */
    esfericoDaFolha: function (c) {
      var e = this.esferico(c.alvo, c.pos);
      if (e.phi < 0.02 || e.phi > Math.PI - 0.02) {
        var th = Math.atan2(-c.cima[0], -c.cima[2]);
        e.theta = isFinite(th) ? th : 0;
        e.phi = e.phi < 0.02 ? 0.0002 : Math.PI - 0.0002;
      }
      return e;
    },
    interp: function (a, b, t) {
      var dt = b.theta - a.theta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
      return { alvo: [a.alvo[0] + (b.alvo[0] - a.alvo[0]) * t, a.alvo[1] + (b.alvo[1] - a.alvo[1]) * t, a.alvo[2] + (b.alvo[2] - a.alvo[2]) * t],
        r: Math.exp(Math.log(a.r) + (Math.log(b.r) - Math.log(a.r)) * t), phi: a.phi + (b.phi - a.phi) * t, theta: a.theta + dt * t };
    },
    suave: function (t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    /* onde a câmera para depois de "sair da folha": oblíqua, olhando o ponto tocado.
       `tam` = a diagonal do modelo (m): a distância cresce com ele, num intervalo de bom senso */
    camFinal: function (lig, P, ini, tam) {
      var t = clamp(num(tam, 40), 4, 2000), dist = clamp(t * 0.32, 8, 60);
      if (lig.tipo === "camera") {
        var e0 = this.esferico(lig.cam.alvo, lig.cam.pos);
        return { alvo: P.slice(), r: clamp(e0.r * 0.6, 3, 80), phi: clamp(e0.phi, 0.35, 1.45), theta: e0.theta };
      }
      if (lig.vista === "planta" || lig.vista === "forro") {
        var a = [P[0], (lig.cota != null ? lig.cota : P[1]) - 0.6, P[2]];
        return { alvo: a, r: dist, phi: 54 * Math.PI / 180, theta: (ini ? ini.theta : 0) - 0.62 };
      }
      var n = lig.n, alvo = soma(P, esc(n, 2.0));
      return { alvo: alvo, r: dist * 1.15, phi: 74 * Math.PI / 180, theta: (ini ? ini.theta : 0) + 0.6 };
    },

    /* ==================================================================
     * 7. O CORTE NA COTA (planos no formato do THREE.Plane: normal·p + constante ≥ 0 fica)
     *   off: o quanto o plano anda no sentido do olhar (m); k: a espessura da FATIA (só na transição; null = sem fundo)
     * ================================================================== */
    planosCorte: function (lig, off, k) {
      if (!lig) return [];
      var n = lig.n, P0;
      if (lig.tipo === "plano") P0 = this.doPapel(lig, lig.rect.x + lig.rect.w / 2, lig.rect.y + lig.rect.h / 2);
      else return [];
      var B = soma(P0, esc(n, num(off, 0))), c0 = -dot(n, B), out = [{ normal: n.slice(), constante: c0 }];
      if (k != null && isFinite(k)) out.push({ normal: esc(n, -1), constante: dot(n, B) + Math.max(0.005, k) });
      return out;
    },
    /* a cota/posição do corte em texto (o rótulo do controle) */
    textoCorte: function (lig, off) {
      off = num(off, 0);
      function f(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
      if (!lig) return "";
      if ((lig.vista === "planta" || lig.vista === "forro") && lig.cota != null) return "Corte na cota " + f(lig.cota + (lig.vista === "forro" ? off : -off)) + " m";
      return Math.abs(off) < 0.005 ? "Corte no plano da prancha" : "Corte a " + f(off) + " m do plano da prancha";
    },
    /* quanto o modelo vai além do plano (para a fatia "sair da folha" até o fim): caixa {min:[..], max:[..]} */
    extensao: function (lig, caixa) {
      if (!lig || !caixa || !vetOk(caixa.min) || !vetOk(caixa.max) || lig.tipo !== "plano") return { kmin: -10, kmax: 10 };
      var P0 = this.doPapel(lig, lig.rect.x + lig.rect.w / 2, lig.rect.y + lig.rect.h / 2), n = lig.n, kmin = 0, kmax = 0;
      for (var i = 0; i < 8; i++) {
        var c = [i & 1 ? caixa.max[0] : caixa.min[0], i & 2 ? caixa.max[1] : caixa.min[1], i & 4 ? caixa.max[2] : caixa.min[2]];
        var s = dot(n, sub(c, P0)); if (s > kmax) kmax = s; if (s < kmin) kmin = s;
      }
      return { kmin: kmin - 0.5, kmax: kmax + 0.5 };
    },

    /* ==================================================================
     * 8. A PEÇA: nome, tipo, GUID e — o diferencial — o ITEM DO ORÇAMENTO e a ETAPA DO CRONOGRAMA ligados a ela.
     * ⚠ NUNCA POR SEMELHANÇA (regra do js/bimorc.js): só o que está CADASTRADO —
     *   item: o carimbo OrcaPRO_CodOrc da peça (= o código do item no orçamento da obra) ou o ELO confirmado da
     *         categoria (bim_orc_vinculos, o que a pessoa casou no "Orçamento do modelo");
     *   etapa: o carimbo OrcaPRO_Etapa casado pelo plano 4D (etapaId) → EXATO; sem carimbo, a regra do 4D (tipo IFC →
     *         categoria de serviço → a janela da categoria) aparece como "pela categoria", dita assim.
     * Entrada: { el, plano4d (o elemento do BIM4D.planejar), etapas (do cronograma), orc: {itens:[{id, codigo, descricao,
     *   unidade, quantidade, etapaNome}]}, vinculos, categoria (a do levantamento), nomeCat (fn) }
     * ================================================================== */
    CLASSE_PT: {
      IFCWALL: "Parede", IFCWALLSTANDARDCASE: "Parede", IFCDOOR: "Porta", IFCWINDOW: "Janela", IFCSLAB: "Laje / piso", IFCCOVERING: "Revestimento / forro",
      IFCMEMBER: "Perfil", IFCPLATE: "Placa", IFCRAILING: "Guarda-corpo", IFCSTAIR: "Escada", IFCSTAIRFLIGHT: "Lance de escada", IFCRAMP: "Rampa", IFCRAMPFLIGHT: "Lance de rampa",
      IFCFLOWTERMINAL: "Aparelho / ponto terminal", IFCBUILDINGELEMENTPROXY: "Elemento genérico", IFCBEAM: "Viga", IFCCOLUMN: "Pilar", IFCFOOTING: "Fundação",
      IFCPILE: "Estaca", IFCROOF: "Cobertura", IFCFLOWSEGMENT: "Trecho de tubo ou eletroduto", IFCPIPESEGMENT: "Tubo", IFCDUCTSEGMENT: "Duto",
      IFCCABLECARRIERSEGMENT: "Eletroduto / eletrocalha", IFCFLOWCONTROLLER: "Registro / controle", IFCFLOWFITTING: "Conexão", IFCPIPEFITTING: "Conexão",
      IFCFURNISHINGELEMENT: "Mobiliário", IFCFURNITURE: "Mobiliário", IFCSPACE: "Ambiente", IFCCURTAINWALL: "Fachada-cortina", IFCREINFORCINGBAR: "Armadura"
    },
    tipoPt: function (tipo) {
      var t = String(tipo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (t && t.indexOf("IFC") !== 0) t = "IFC" + t;
      return this.CLASSE_PT[t] || (t ? t.replace(/^IFC/, "").toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }) : "Elemento");
    },
    infoPeca: function (e) {
      e = e || {};
      var el = e.el || {}, pl = e.plano4d || null, etapas = arr(e.etapas), orc = e.orc || null, vinc = arr(e.vinculos);
      var out = { uid: txt(el.uid), nome: txt(el.nome), tipo: txt(el.tipo), tipoPt: this.tipoPt(el.tipo), guid: txt(el.globalId || el.guid),
        disciplina: txt(el.disciplina), item: null, etapa: null, pendencias: [] };
      /* --- o item do orçamento --- */
      var itens = orc ? arr(orc.itens) : [];
      var cod = txt(el.codOrc || (pl && pl.codOrc)).trim();
      if (cod && itens.length) {
        var porCod = itens.filter(function (it) { return txt(it.codigo).trim() === cod; });
        if (porCod.length) out.item = { id: porCod[0].id, codigo: cod, descricao: txt(porCod[0].descricao), unidade: txt(porCod[0].unidade), quantidade: num(porCod[0].quantidade, 0),
          etapaNome: txt(porCod[0].etapaNome), como: "carimbo da peça (código " + cod + ")", outros: porCod.length - 1 };
      }
      if (!out.item && e.categoria && vinc.length) {
        var v = vinc.filter(function (x) { return x && txt(x.categoria) === txt(e.categoria); })[0];
        if (v) {
          var it = itens.filter(function (x) { return String(x.id) === String(v.itemId); })[0];
          out.item = { id: v.itemId, codigo: it ? txt(it.codigo) : "", descricao: it ? txt(it.descricao) : txt(v.itemDescricao), unidade: it ? txt(it.unidade) : txt(v.itemUnidade),
            quantidade: it ? num(it.quantidade, 0) : null, etapaNome: it ? txt(it.etapaNome) : "", como: "elo da categoria “" + txt(e.categoria) + "”", sumiu: !it };
        }
      }
      if (!out.item) {
        out.pendencias.push(!orc ? { id: "sem-orcamento", texto: "A obra deste modelo não está ligada a um orçamento.", acao: "orc-obra", rotulo: "Ligar a obra a um orçamento" }
          : cod ? { id: "codigo-fora", texto: "A peça traz o código " + cod + ", que não está no orçamento da obra.", acao: "orc-modelo", rotulo: "Abrir o orçamento do modelo" }
          : { id: "sem-item", texto: "Esta peça ainda não está ligada a um item do orçamento.", acao: "orc-modelo", rotulo: "Ligar no orçamento do modelo" });
      } else if (out.item.sumiu) out.pendencias.push({ id: "item-sumiu", texto: "O elo aponta para um item que não existe mais no orçamento.", acao: "orc-modelo", rotulo: "Refazer o elo" });
      /* --- a etapa do cronograma --- */
      if (pl) {
        var et = pl.etapaId != null ? etapas.filter(function (x) { return String(x.id) === String(pl.etapaId); })[0] : null;
        if (et) out.etapa = { id: et.id, nome: txt(et.nome) || txt(et.codigo), inicio: num(et.inicio, null), fim: num(et.fim, null), exato: true, como: "carimbo da peça" };
        else if (pl.cat) {
          var nomeC = typeof e.nomeCat === "function" ? e.nomeCat(pl.cat) : pl.cat;
          var temCrono = etapas.length > 0;
          out.etapa = { id: null, nome: nomeC, inicio: num(pl.semInicio, null), fim: num(pl.semFim, null), exato: !!pl.exato, como: pl.exato ? "categoria do carimbo" : "pela categoria do tipo IFC (regra do 4D)", ilustrativa: !temCrono };
          if (!temCrono) out.pendencias.push({ id: "sem-crono", texto: "Sem cronograma ligado à obra: as semanas são a sequência ilustrativa do 4D.", acao: "quatro-d", rotulo: "Abrir a Simulação 4D" });
        }
      }
      if (!out.etapa) out.pendencias.push({ id: "sem-etapa", texto: "Esta peça não está em nenhuma etapa do cronograma.", acao: "quatro-d", rotulo: "Abrir a Simulação 4D" });
      return out;
    },

    /* ==================================================================
     * 9. O PACOTE PARA O CELULAR (vai em `dados.pranchas` do link da RA/RV — lista branca, com teto)
     * ⚠ Só imagem e matriz: nada de texto livre da prancha além do título, nada de valor (o link vai ao cliente).
     * ================================================================== */
    MAX_FOLHAS_LINK: 12,
    MAX_BYTES_LINK: 2200000,
    folhaParaLink: function (f) {
      if (!f || typeof f !== "object") return null;
      var img = txt(f.img);
      if (!/^data:image\/(webp|jpeg|png);base64,/.test(img)) return null;
      var W = num(f.wMm, 0), H = num(f.hMm, 0); if (!(W > 0 && H > 0)) return null;
      var ligs = arr(f.ligs).map(function (l) {
        if (!l || !l.rect) return null;
        var R = { x: num(l.rect.x, 0), y: num(l.rect.y, 0), w: num(l.rect.w, 0), h: num(l.rect.h, 0) };
        if (!(R.w > 0 && R.h > 0)) return null;
        if (l.tipo === "plano" && arr(l.M).length === 3 && l.M.every(function (r) { return arr(r).length === 3 && r.every(function (x) { return isFinite(+x); }); }) && vetOk(l.n)) {
          return { tipo: "plano", vista: /^(planta|forro|corte|fachada)$/.test(txt(l.vista)) ? l.vista : "planta", rect: R, M: l.M.map(function (r) { return r.map(Number); }), n: l.n.map(Number),
            mmPorM: num(l.mmPorM, 10), cota: l.cota == null ? null : num(l.cota, null), nome: txt(l.nome).slice(0, 80), marcas: PV.marcasParaLink(l.marcas) };
        }
        if (l.tipo === "camera" && l.cam && vetOk(l.cam.pos) && vetOk(l.cam.alvo)) {
          return { tipo: "camera", rect: R, cam: { pos: l.cam.pos.map(Number), alvo: l.cam.alvo.map(Number), up: vetOk(l.cam.up) ? l.cam.up.map(Number) : [0, 1, 0], fov: num(l.cam.fov, 50) },
            aspecto: R.w / R.h, nome: txt(l.nome).slice(0, 80) };
        }
        return null;
      }).filter(Boolean);
      if (!ligs.length) return null;
      return { id: txt(f.id).slice(0, 80), titulo: txt(f.titulo).slice(0, 120), wMm: W, hMm: H, img: img, ligs: ligs, px: Math.max(0, Math.round(num(f.px, 0))) };
    },
    pranchasParaLink: function (folhas) {
      var out = [], total = 0, cortadas = 0, self = this;
      arr(folhas).forEach(function (f) {
        var x = self.folhaParaLink(f); if (!x) { cortadas++; return; }
        if (out.length >= self.MAX_FOLHAS_LINK) { cortadas++; return; }
        var t = JSON.stringify(x).length;
        if (total + t > self.MAX_BYTES_LINK) { cortadas++; return; }
        total += t; out.push(x);
      });
      return { folhas: out, bytes: total, cortadas: cortadas };
    },
    /* a ligação vinda do link (o celular): o mesmo formato do computador */
    ligacaoDoLink: function (l) {
      if (!l) return null;
      var marcas = this.marcasDoLink(l.marcas);
      if (l.tipo === "plano") return { tipo: "plano", origem: "link", vista: l.vista, M: l.M, n: l.n, rect: l.rect, mmPorM: num(l.mmPorM, 10), cota: l.cota, nome: l.nome, marcas: marcas };
      if (l.tipo === "camera") return this.ligacaoCamera(l.rect, l.cam, { nome: l.nome });
      return null;
    },

    /* ==================================================================
     * 10. OS MARCADORES DA FOLHA (23/10/2026): porta, janela, cômodo, escada — tocar leva à PEÇA no 3D.
     * ⚠ A posição sai da CAIXA DA PEÇA no modelo projetada pela matriz da própria vista (a mesma conta do toque),
     *   nunca do texto do desenho. Só entra o que a vista mostra:
     *   - planta/forro: a peça atravessa a faixa do corte (da cota − 1,15 m à cota + 0,10 m; o forro olha para cima);
     *   - corte: a peça está até `profMax` (3 m) além do plano, para o lado que a vista olha (ou cortada por ele);
     *   - fachada: só a camada da frente (até 1,2 m atrás da peça mais próxima) — a fachada não vê o miolo.
     * itens = [{ uid, chave?, tipo (classe IFC), nome, min:[x,y,z], max:[x,y,z] }] (metros da cena)
     * Saída: [{ uid, chave, tipo: porta|janela|comodo|escada|rampa, classe, nome, rotulo, x, y (mm), P (no plano), prof }]
     * ================================================================== */
    TIPOS_MARCA: { IFCDOOR: "porta", IFCDOORSTANDARDCASE: "porta", IFCWINDOW: "janela", IFCWINDOWSTANDARDCASE: "janela", IFCSPACE: "comodo",
      IFCSTAIR: "escada", IFCSTAIRFLIGHT: "escada", IFCRAMP: "rampa", IFCRAMPFLIGHT: "rampa" },
    ROTULO_MARCA: { porta: "P", janela: "J", escada: "E", rampa: "R" },
    tipoMarca: function (classe) {
      var t = String(classe || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (t && t.indexOf("IFC") !== 0) t = "IFC" + t;
      return this.TIPOS_MARCA[t] || "";
    },
    /* a área do DESENHO na folha (o viewBox encaixado no quadro); a folha com matriz é a folha inteira */
    areaDesenho: function (lig) {
      if (!lig) return null;
      if (lig.enc && lig.vb) {
        var a = { x: lig.enc.ox, y: lig.enc.oy, w: lig.vb.w * lig.enc.k, h: lig.vb.h * lig.enc.k }, R = lig.rect;
        var x0 = Math.max(a.x, R.x), y0 = Math.max(a.y, R.y), x1 = Math.min(a.x + a.w, R.x + R.w), y1 = Math.min(a.y + a.h, R.y + R.h);
        return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : R;
      }
      return lig.rect;
    },
    marcadores: function (lig, itens, opts) {
      opts = opts || {};
      if (!lig || lig.tipo !== "plano") return [];
      var self = this, R = this.areaDesenho(lig), out = [], planta = lig.vista === "planta" || lig.vista === "forro";
      var profMax = num(opts.profMax, 3), minMm = num(opts.minMm, 4), max = num(opts.max, 240);
      arr(itens).forEach(function (it) {
        if (!it || !vetOk(it.min) || !vetOk(it.max)) return;
        var tipo = self.tipoMarca(it.tipo); if (!tipo) return;
        /* ⚠ a fachada vê a CASCA do prédio: o cômodo da frente (a caixa dele encosta na parede de fora, a menos de 1,2 m)
           virava um marcador "Sala" no meio da elevação, e tocar nele levava para DENTRO (revisão, 23/10/2026) */
        if (lig.vista === "fachada" && tipo === "comodo") return;
        var C = [(it.min[0] + it.max[0]) / 2, (it.min[1] + it.max[1]) / 2, (it.min[2] + it.max[2]) / 2];
        if (planta && lig.cota != null) {
          var lo = lig.vista === "forro" ? lig.cota - 0.1 : lig.cota - 1.15, hi = lig.vista === "forro" ? lig.cota + 1.5 : lig.cota + 0.1;
          if (it.max[1] < lo || it.min[1] > hi) return;
        }
        var mm = self.paraPapel(lig, C);
        if (!isFinite(mm.x) || !isFinite(mm.y)) return;
        if (!(mm.x >= R.x && mm.y >= R.y && mm.x <= R.x + R.w && mm.y <= R.y + R.h)) return;
        var prof = isFinite(mm.prof) ? mm.prof : 0;
        if (!planta) {
          /* a peça cortada pelo plano conta (a caixa atravessa); senão, à frente do plano, até profMax */
          var pMin = Infinity, pMax = -Infinity;
          for (var i = 0; i < 8; i++) {
            var c = [i & 1 ? it.max[0] : it.min[0], i & 2 ? it.max[1] : it.min[1], i & 4 ? it.max[2] : it.min[2]], pp = self.paraPapel(lig, c).prof;
            if (pp < pMin) pMin = pp; if (pp > pMax) pMax = pp;
          }
          if (pMax < -0.05) return;                                   /* atrás do plano: a vista não vê */
          if (lig.vista !== "fachada" && pMin > profMax) return;      /* longe demais no corte */
          prof = Math.max(0, pMin);
        }
        var nome = txt(it.nome).trim();
        out.push({ uid: txt(it.uid), chave: txt(it.chave), tipo: tipo, classe: txt(it.tipo), nome: nome.slice(0, 120),
          rotulo: tipo === "comodo" ? (nome || "Ambiente").slice(0, 28) : self.ROTULO_MARCA[tipo] || "•",
          x: mm.x, y: mm.y, P: self.doPapel(lig, mm.x, mm.y), prof: prof });
      });
      /* a fachada vê a camada da frente */
      if (lig.vista === "fachada" && out.length) {
        var pm = Math.min.apply(null, out.map(function (m) { return m.prof; }));
        out = out.filter(function (m) { return m.prof <= pm + 1.2; });
      }
      /* um por "célula" de minMm (as portas de um banheiro empilhadas viram um só toque); o cômodo primeiro,
         e na mesma célula a peça mais perto do plano */
      var ORD = { comodo: 0, porta: 1, escada: 2, rampa: 2, janela: 3 };
      out.sort(function (a, b) { return (ORD[a.tipo] - ORD[b.tipo]) || (a.prof - b.prof) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0); });
      var vistos = {}, fim = [];
      out.forEach(function (m) {
        if (fim.length >= max) return;
        var k = (m.tipo === "comodo" ? "c" : "p") + Math.round(m.x / minMm) + "_" + Math.round(m.y / minMm);
        if (vistos[k]) return; vistos[k] = 1; fim.push(m);
      });
      return fim;
    },
    /* os marcadores no link: só posição, tipo, rótulo e a CHAVE estável da peça (o uid do computador não vale no celular) */
    marcasParaLink: function (marcas) {
      return arr(marcas).slice(0, 240).map(function (m) {
        if (!m || !isFinite(+m.x) || !isFinite(+m.y)) return null;
        var t = /^(porta|janela|comodo|escada|rampa)$/.test(txt(m.tipo)) ? m.tipo : "";
        if (!t) return null;
        return { x: +(+m.x).toFixed(2), y: +(+m.y).toFixed(2), tipo: t, rotulo: txt(m.rotulo).slice(0, 28), nome: txt(m.nome).slice(0, 80), chave: txt(m.chave).slice(0, 160) };
      }).filter(Boolean);
    },
    marcasDoLink: function (lista) { return this.marcasParaLink(lista); },

    /* ==================================================================
     * 11. ASSINATURA (o link reaproveitado só quando NADA mudou: as folhas, as vistas e o modelo)
     * ⚠ Roteiro do defeito (23/10/2026): o link guardado era reaproveitado pela assinatura dos MODELOS e das opções —
     *   a prancha mudada (vista nova posicionada, folha apagada, modelo editado) mandava ao cliente o pacote velho.
     * FNV-1a 32 bits sem Math.imul (o WebView antigo não tem), mais o tamanho do texto.
     * ================================================================== */
    assinatura: function (partes) {
      var s = typeof partes === "string" ? partes : JSON.stringify(partes == null ? "" : partes), h = 0x811c9dc5;
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0; }
      return ("0000000" + h.toString(16)).slice(-8) + "-" + s.length.toString(36);
    },

    /* ==================================================================
     * 12. A RESOLUÇÃO DA FOLHA NO LINK: a maior que cabe no orçamento de bytes (legível com zoom no celular)
     *   Medido no e2e de 21/10: uma folha A1 de traço em JPEG 0,82 ≈ 0,05 byte/px; 0,12 é a folga das folhas
     *   com foto. Entre 1600 px (mínimo legível de uma A3) e 4096 px (teto de textura de celular médio).
     * ================================================================== */
    larguraRaster: function (wMm, hMm, bytesDisponiveis) {
      var w = num(wMm, 0), h = num(hMm, 0); if (!(w > 0 && h > 0)) return 1600;
      var px = Math.sqrt(Math.max(1, num(bytesDisponiveis, 0)) / 0.12 * (w / h));
      return Math.round(clamp(px, 1600, 4096));
    },

    /* ==================================================================
     * 13. A EDIFICAÇÃO (23/10/2026): a caixa da CASA, não a do arquivo.
     * Roteiro do defeito: o IFC do SketchUp da CASA MAR (904 peças genéricas, nomes "Componente#12"/"Undefined") traz o terreno
     *   (uma "Grama - Verde" de 130 × 78 m), um plano de água de 355 × 157 m a 5,7 m de altura, pedras, árvores e até um
     *   boneco esquecido na origem. A caixa do modelo inteiro (355 × 163 m) virava a caixa da planta, dos cortes e das
     *   elevações: a casa (45 × 20 m) saía minúscula e o Corte A "não cabia no A1 nem em 1:500".
     * O critério, em ordem (cada passo só tira o que prova ser entorno; na dúvida, a peça FICA):
     *   0. CAIXA DE CORTE da vista 3D ligada = a pessoa escolheu a área: vale ela (só entra o que a toca).
     *   1. CLASSE: IfcSite e IfcGeographicElement (terreno, vegetação do IFC) saem sempre.
     *   2. TEXTO (nome, camada, material, tag) com termo de entorno — terreno, solo, grama, árvore, vegetação, pedra… — mas
     *      SÓ em peça genérica (IfcBuildingElementProxy, é o que o SketchUp exporta): uma laje "sobre solo" ou um revestimento
     *      "pedra" de um projeto de arquitetura é IfcSlab/IfcWall e nunca sai por nome. "Pedra/rocha/stone" é termo FRACO: só tira peça do
     *      tamanho de uma pedra (≤ 30 % do lado maior da casa) — a parede de pedra comprida fica.
     *   (3 e 4 também só valem para peça genérica: o modelo desenhado no OrçaPRO, com paredes e lajes de verdade, nunca perde peça.)
     *   3. GEOMETRIA: peça horizontal fina e enorme (≥ 6× a área da região onde está a massa das peças, e ≥ 300 m²) ou
     *      gigante de qualquer espessura (≥ 10×) é solo. A "região da massa" = caixa dos centros entre os percentis 5 e 95.
     *      Uma laje de radier mede ~ 1–2× essa região: nunca chega perto.
     *   4. AGLOMERADO: o que sobra é agrupado por vizinhança; ficam os grupos grandes (cada um com ≥ 10 % das peças) e o
     *      maior sempre; satélites soltos que somam ≤ 15 % das peças e esticam a caixa (o boneco na origem, a cortina
     *      esquecida a 100 m) saem. Dois prédios de um conjunto (cada um > 10 %) ficam os dois.
     * Entrada: elementos [{ uid, tipo, nome, nomeIfc, tag, familia, camada, materiais:[{n}|string], min:[x,y,z], max:[x,y,z] }]
     *   (cena em metros, Y para cima); opts { caixaCorte: { on, min, max } }.
     * Saída: { caixa: { min, max } | null, exclusoes: { uid: motivo }, nExcluidos, nTotal, criterio, motivos: { motivo: n }, texto }
     *   criterio: "vazio" | "sem-entorno" (nada saiu: o desenho fica como sempre foi) | "entorno-excluido" | "caixa-de-corte"
     * ================================================================== */
    CLASSES_SOLO: { IFCSITE: 1, IFCGEOGRAPHICELEMENT: 1, IFCGEOGRAPHICELEMENTTYPE: 1, IFCGEOSLICE: 1, IFCGEOMODEL: 1 },
    CLASSES_GENERICAS: { IFCBUILDINGELEMENTPROXY: 1, IFCPROXY: 1, IFCGEOGRAPHICELEMENT: 1, IFCSITE: 1, IFCCIVILELEMENT: 1, IFCEARTHWORKSELEMENT: 1 },
    TERMOS_ENTORNO: /(^|[^a-z0-9])(terreno|terrain|topograf[a-z]*|toposurface|toposolid|topo[ _-]?surface|solo|ground|grama|gramado|grass|lawn|relva|vegeta[a-z]*|arvore[s]?|tree[s]?|arbusto[s]?|shrub[s]?|bush(es)?|folhagem|leaves|palmeira[s]?|coqueiro[s]?|jardim|garden|paisag[a-z]*|landscape|entorno|contexto|site|terra)([^a-z0-9]|$)/,
    TERMOS_ENTORNO_FRACOS: /(^|[^a-z0-9])(pedra[s]?|pedregulho[s]?|seixo[s]?|rocha[s]?|rock[s]?|stone[s]?|boulder[s]?)([^a-z0-9]|$)/,
    MOTIVOS_TEXTO: { classe: "classe IFC (terreno/entorno)", nome: "o nome", camada: "a camada", material: "o material", "solo-geometrico": "ser um plano ou volume enorme (solo)",
      "fora-do-aglomerado": "estar longe da edificação", "fora-da-caixa-de-corte": "ficar fora da caixa de corte", pedra: "ser pedra ou entorno pequeno" },
    _semAcento: function (s) {
      return String(s == null ? "" : s).toLowerCase()
        .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o").replace(/[ùúûü]/g, "u").replace(/ç/g, "c").replace(/ñ/g, "n");
    },
    _classeIfc: function (t) {
      t = String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      return t && t.indexOf("IFC") !== 0 ? "IFC" + t : t;
    },
    /* a razão de uma peça ser entorno pelo que está ESCRITO nela: { motivo, fraco } ou null */
    entornoPorTexto: function (e) {
      var self = this, cls = this._classeIfc(e.tipo);
      if (this.CLASSES_SOLO[cls]) return { motivo: "classe", fraco: false };
      if (!this.CLASSES_GENERICAS[cls]) return null;
      var campos = [["nome", [e.nomeIfc, e.nome, e.tag, e.familia]], ["camada", [e.camada]],
                    ["material", arr(e.materiais).map(function (m) { return m && typeof m === "object" ? (m.n || m.nome || "") : m; })]];
      var fraco = null;
      for (var i = 0; i < campos.length; i++) for (var j = 0; j < campos[i][1].length; j++) {
        var s = self._semAcento(campos[i][1][j]); if (!s) continue;
        if (self.TERMOS_ENTORNO.test(s)) return { motivo: campos[i][0], fraco: false };
        if (!fraco && self.TERMOS_ENTORNO_FRACOS.test(s)) fraco = { motivo: campos[i][0], fraco: true };
      }
      return fraco;
    },
    _limitesOk: function (e) { return !!e && vetOk(e.min) && vetOk(e.max) && e.max[0] >= e.min[0] && e.max[1] >= e.min[1] && e.max[2] >= e.min[2]; },
    _uniao: function (lista) {
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      lista.forEach(function (e) { for (var k = 0; k < 3; k++) { if (e.min[k] < mn[k]) mn[k] = e.min[k]; if (e.max[k] > mx[k]) mx[k] = e.max[k]; } });
      return lista.length ? { min: mn, max: mx } : null;
    },
    _percentil: function (v, p) {
      if (!v.length) return 0;
      var s = v.slice().sort(function (a, b) { return a - b; }), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
      return s[lo] + (s[hi] - s[lo]) * (i - lo);
    },
    /* a região onde está a massa das peças (caixa dos centros entre P5 e P95, em x e z) e o lado dela */
    regiaoDaMassa: function (lista) {
      var cx = [], cz = [], lados = [];
      lista.forEach(function (e) { cx.push((e.min[0] + e.max[0]) / 2); cz.push((e.min[2] + e.max[2]) / 2); lados.push(Math.max(e.max[0] - e.min[0], e.max[2] - e.min[2])); });
      var fol = Math.max(0.5, this._percentil(lados, 0.5));
      var x0 = this._percentil(cx, 0.05), x1 = this._percentil(cx, 0.95), z0 = this._percentil(cz, 0.05), z1 = this._percentil(cz, 0.95);
      return { x0: x0 - fol, x1: x1 + fol, z0: z0 - fol, z1: z1 + fol, area: (x1 - x0 + 2 * fol) * (z1 - z0 + 2 * fol), lado: Math.max(x1 - x0, z1 - z0) + 2 * fol };
    },
    /* agrupa as peças por vizinhança (caixas a menos de `folga` m no plano x-z): grade + união */
    aglomerados: function (lista, folga) {
      var n = lista.length, pai = [], cel = Math.max(1, folga), mapa = {};
      for (var i = 0; i < n; i++) pai.push(i);
      function raiz(a) { while (pai[a] !== a) { pai[a] = pai[pai[a]]; a = pai[a]; } return a; }
      function une(a, b) { a = raiz(a); b = raiz(b); if (a !== b) pai[a] = b; }
      lista.forEach(function (e, i) {
        var g = folga / 2, x0 = Math.floor((e.min[0] - g) / cel), x1 = Math.floor((e.max[0] + g) / cel), z0 = Math.floor((e.min[2] - g) / cel), z1 = Math.floor((e.max[2] + g) / cel);
        var passoX = Math.max(1, Math.ceil((x1 - x0 + 1) / 60)), passoZ = Math.max(1, Math.ceil((z1 - z0 + 1) / 60));
        for (var a = x0; a <= x1; a += passoX) for (var b = z0; b <= z1; b += passoZ) {
          var k = a + "," + b;
          if (mapa[k] == null) mapa[k] = i; else une(i, mapa[k]);
        }
        var kk = x1 + "," + z1; if (mapa[kk] == null) mapa[kk] = i; else une(i, mapa[kk]);   /* a ponta da peça comprida entra sempre */
      });
      var grupos = {};
      for (var j = 0; j < n; j++) { var r = raiz(j); (grupos[r] = grupos[r] || []).push(j); }
      return Object.keys(grupos).map(function (k) { return grupos[k]; }).sort(function (a, b) { return b.length - a.length; });
    },
    caixaEdificacao: function (elementos, opts) {
      opts = opts || {};
      var self = this, todos = arr(elementos).filter(function (e) { return self._limitesOk(e) && txt(e.uid); });
      var res = { caixa: null, exclusoes: {}, nExcluidos: 0, nTotal: todos.length, criterio: "vazio", motivos: {}, texto: "" };
      if (!todos.length) { res.texto = "Sem peças para medir."; return res; }
      function area2(e) { return (e.max[0] - e.min[0]) * (e.max[2] - e.min[2]); }
      function generica(e) { return !!self.CLASSES_GENERICAS[self._classeIfc(e.tipo)]; }
      function tira(e, motivo) { if (res.exclusoes[e.uid]) return;
        /* PROTEGIDA = peça desenhada no OrçaPRO (uid "edit:…"): a vegetação, a grama e as pedras que o projetista modelou na casa fazem parte do
           desenho (a planta técnica da Casa 487 mostra o paisagismo). O entorno a tirar é o do ARQUIVO IFC importado (terreno do SketchUp);
           só a caixa de corte da vista 3D, que é escolha explícita da pessoa, tira também a peça protegida. */
        if (e.protegido && motivo !== "fora-da-caixa-de-corte") return; res.exclusoes[e.uid] = motivo; res.nExcluidos++; res.motivos[motivo] = (res.motivos[motivo] || 0) + 1; }
      function resto() { return todos.filter(function (e) { return !res.exclusoes[e.uid]; }); }
      function fecha(criterio, caixa) {
        res.caixa = caixa; res.criterio = criterio;
        var ms = Object.keys(res.motivos).map(function (k) { return res.motivos[k] + " por " + (self.MOTIVOS_TEXTO[k] || k); });
        res.texto = criterio === "sem-entorno" ? "Edificação = o modelo inteiro (nenhum terreno ou entorno achado)."
          : criterio === "caixa-de-corte" ? "Edificação = a caixa de corte da vista 3D (" + res.nExcluidos + " peça(s) de fora)."
          : "Edificação medida sem " + res.nExcluidos + " peça(s) de entorno: " + ms.join("; ") + ".";
        return res;
      }
      /* 0. a caixa de corte ligada manda: só entra o que a toca (o terreno e a vegetação de dentro dela ainda saem, passos 1–3) */
      var cc = opts.caixaCorte, emCorte = false;
      if (cc && cc.on && vetOk(cc.min) && vetOk(cc.max)) {
        var dentro = todos.filter(function (e) { for (var k = 0; k < 3; k++) if (e.max[k] < cc.min[k] || e.min[k] > cc.max[k]) return false; return true; });
        if (dentro.length) {
          emCorte = true;
          todos.forEach(function (e) { if (dentro.indexOf(e) < 0) tira(e, "fora-da-caixa-de-corte"); });
        }
      }
      /* 1 e 2. classe e texto */
      var fracos = [];
      todos.forEach(function (e) {
        var r = self.entornoPorTexto(e); if (!r) return;
        if (r.fraco) fracos.push({ e: e, motivo: r.motivo }); else tira(e, r.motivo);
      });
      /* 3. geometria: o plano ou o volume gigante — SÓ peça genérica (um piso de verdade é IfcSlab; o modelo desenhado
         no OrçaPRO, com uma laje grande e poucas paredes, não perde a laje) */
      var vivos = resto();
      if (vivos.length >= 5) {
        var reg = this.regiaoDaMassa(vivos);
        vivos.filter(generica).sort(function (a, b) { return area2(b) - area2(a); }).forEach(function (e) {
          var a = area2(e), dx = e.max[0] - e.min[0], dz = e.max[2] - e.min[2], dy = e.max[1] - e.min[1];
          var fino = dy <= Math.max(0.6, 0.06 * Math.max(dx, dz));
          if (a >= 300 && ((fino && a >= 6 * reg.area) || a >= 10 * reg.area)) tira(e, "solo-geometrico");
        });
      }
      /* 4. aglomerado: os satélites soltos */
      vivos = resto();
      if (!emCorte && vivos.length >= 8) {
        var reg2 = this.regiaoDaMassa(vivos), folga = Math.max(2, Math.min(15, 0.15 * reg2.lado)), gr = this.aglomerados(vivos, folga);
        if (gr.length > 1) {
          var limite = Math.max(1, Math.ceil(0.10 * vivos.length)), satel = [], soma = 0;
          /* só some um grupo todo de peças genéricas: uma parede de verdade, separada do resto, é do projeto */
          gr.forEach(function (g, i) { if (i > 0 && g.length < limite && g.every(function (ix) { return generica(vivos[ix]); })) { satel.push(g); soma += g.length; } });
          if (satel.length && soma <= 0.15 * vivos.length) {
            var mantidos = []; gr.forEach(function (g) { if (satel.indexOf(g) < 0) g.forEach(function (ix) { mantidos.push(vivos[ix]); }); });
            var uA = this._uniao(vivos), uM = this._uniao(mantidos);
            if (area2(uA) >= 1.3 * area2(uM)) satel.forEach(function (g) { g.forEach(function (ix) { tira(vivos[ix], "fora-do-aglomerado"); }); });
          }
        }
      }
      /* a pedra e o entorno pequeno (termo fraco): saem se têm o tamanho de uma pedra */
      vivos = resto();
      if (fracos.length && vivos.length) {
        var uV = this._uniao(vivos), ladoMax = Math.max(uV.max[0] - uV.min[0], uV.max[2] - uV.min[2]);
        fracos.forEach(function (f) {
          var e = f.e; if (res.exclusoes[e.uid]) return;
          if (Math.max(e.max[0] - e.min[0], e.max[2] - e.min[2]) <= 0.3 * ladoMax) tira(e, "pedra");
        });
      }
      var fica = resto();
      if (!fica.length) { res.exclusoes = {}; res.nExcluidos = 0; res.motivos = {}; return fecha("sem-entorno", this._uniao(todos)); }
      if (emCorte) {
        var u0 = this._uniao(fica), mn = [], mx = [];
        for (var k0 = 0; k0 < 3; k0++) { mn.push(Math.max(cc.min[k0], u0.min[k0])); mx.push(Math.min(cc.max[k0], u0.max[k0])); }
        return fecha("caixa-de-corte", { min: mn, max: mx });
      }
      return fecha(res.nExcluidos ? "entorno-excluido" : "sem-entorno", this._uniao(fica));
    },

    /* ==================================================================
     * 14. OS PAVIMENTOS POR COTA (IFC sem IfcBuildingStorey, como o do SketchUp)
     * O piso de cada pavimento é onde COMEÇAM as peças verticais (parede, pilar, porta: altura de 1,8 a 6 m e até 12 m de
     * lado): as cotas de base dessas peças são agrupadas (emendadas a menos de 0,6 m); vale o grupo com ≥ 6 peças e ≥ 12 %
     * das verticais; pisos a menos de 2,2 m um do outro viram um só (o de mais peças). A cota do piso = a mediana das bases.
     * Medido no IFC da CASA MAR: 209 das 213 verticais começam entre 8,5 e 9,0 m (a casa está num patamar; o chão do
     * terreno é 0): um pavimento a 8,75 m — e a planta corta a 1,20 m dali, não a 1,20 m do chão do terreno.
     * Sem grupo que se sustente: um só ("Térreo", no pé da edificação).
     * Entrada: elementos, caixa (a da edificação), exclusoes. Saída: [{ nome, y }] (y = cota do piso, mundo)
     * ================================================================== */
    pavimentosPorCota: function (elementos, caixa, exclusoes) {
      var self = this, ex = exclusoes || {};
      if (!caixa || !vetOk(caixa.min) || !vetOk(caixa.max)) return [];
      var bases = [];
      arr(elementos).forEach(function (e) {
        if (!self._limitesOk(e) || ex[e.uid]) return;
        var dy = e.max[1] - e.min[1], L = Math.max(e.max[0] - e.min[0], e.max[2] - e.min[2]);
        if (dy >= 1.8 && dy <= 6 && L <= 12) bases.push(e.min[1]);
      });
      var vazio = [{ nome: "Térreo", y: caixa.min[1] }];
      if (bases.length < 6) return vazio;
      bases.sort(function (a, b) { return a - b; });
      var grupos = [[bases[0]]];
      for (var i = 1; i < bases.length; i++) {
        var g = grupos[grupos.length - 1];
        if (bases[i] - g[g.length - 1] <= 0.6) g.push(bases[i]); else grupos.push([bases[i]]);
      }
      var pisos = grupos.filter(function (g) { return g.length >= 6 && g.length >= 0.12 * bases.length; })
        .map(function (g) { return { y: g[Math.floor(g.length / 2)], n: g.length }; });
      var fim = [];
      pisos.forEach(function (p) {
        var u = fim[fim.length - 1];
        if (u && p.y - u.y < 2.2) { if (p.n > u.n) fim[fim.length - 1] = p; return; }
        fim.push(p);
      });
      if (!fim.length) return vazio;
      return fim.map(function (p, i) { return { nome: i ? "Pavimento " + (i + 1) : "Térreo", y: p.y }; });
    }
  };

  global.PranchaViva = PV;
  if (typeof module !== "undefined" && module.exports) module.exports = PV;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * elegeo.js (EleGeo) — GEOMETRIA REAL DO ELETRODUTO (Elétrica v2, lote L4, 07/11/2026)
 *
 * Pedido do Rogério: "igual ao produto real" — tubo liso de cor chapada é reprovado. Aqui cada eletroduto sai com a forma de verdade,
 * com as cotas do catálogo (js/elecatalogodados.js, L1):
 *   corrugado (amarelo leve Tigreflex / laranja reforçado): ondulação anelar de verdade (passo do catálogo), em ANÉIS de crista e de vale,
 *       normais por faixa (aresta viva, a luz marca a crista); a CURVA é contínua no próprio tubo — o corrugado faz curva sem conexão, com
 *       raio de 4·DE (valor usual, sem-fonte-conferir) — e a metade da curva de cada trecho se encontra no meio do arco (mesmo ponto, mesma tangente);
 *   rígido roscável (preto) e soldável (cinza): tubo liso com o DE do catálogo, LUVA a cada barra de 3 m e BUCHA + ARRUELA de alumínio
 *       onde o tubo entra na caixa (a curva e a luva de emenda no nó continuam sendo as conexões do biminst);
 *   flexível metálico (sealtubo, material novo elet_flexivel_metalico): ESPIRAL helicoidal visível sob a capa de PVC preta.
 * Nível de detalhe: "perto" = ondulação; "longe"/"icone" (cena grande ou nível Médio) = tubo simples; e um ORÇAMENTO de triângulos por
 * reconstrução (ORCAMENTO.teto): o que passa dele sai simples — a casa de 60 trechos não pode travar a placa de vídeo.
 *
 * COMO LIGA: um gancho de poucas linhas no início de HidGeo.tubo (js/biminstgeo.js, marcado // eletrica-v2) chama EleGeo.tubo(t, o) quando
 * o material começa com elet_. Os vizinhos (para a curva contínua) vêm da rede do render: este arquivo embrulha BimInst.rede (sem editar o
 * biminst) e guarda a última rede. Sem EleGeo, ou se EleGeo.tubo devolver null, vale o desenho de antes.
 *
 * SAÍDA = a mesma do HidGeo.tubo: { partes:[{papel, malha:{pos,nrm,idx,cascas}}], cotas, juntas, inicio, fim, aConferir } em metros, Y para cima.
 * Papéis: "corpo" (o tubo), "luva" (a mesma cor do tubo), "elet_aluminio" (bucha e arruela, registrado em HidGeo.PAPEL aqui).
 *
 * API: tubo(t,o), caminho(t,o) (o eixo real, para a fiação 3D), cotas(material,dn), registrarRede(R), configurar({orcamento}),
 *      MAPA, ORCAMENTO, ALTURA_ONDA_FRAC, RAIO_CURVA_FATOR, estatisticas().
 * ES5, global + module.exports. Teste: node tools/test-ele-geo.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function CAT() { return dep("EleCatalogoDados", "./elecatalogodados.js"); }
  function HG() { return dep("HidGeo", "./biminstgeo.js"); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  var MM = 0.001;

  /* ------------------------------------------------------------ vetores */
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function nrmz(a) { var l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }
  function pv(p) { return Array.isArray(p) ? p : [num(p.x, 0), num(p.y, 0), num(p.z, 0)]; }
  function perp(d) { var ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; return nrmz(cross(ref, d)); }
  function rodrigues(v, eixo, ang) { var c = Math.cos(ang), s = Math.sin(ang); return add(add(mul(v, c), mul(cross(eixo, v), s)), mul(eixo, dot(eixo, v) * (1 - c))); }

  /* ------------------------------------------------------------ malha */
  function Malha() { this.pos = []; this.nrm = []; this.idx = []; this.cascas = []; }
  Malha.prototype.v = function (p, n) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); return this.pos.length / 3 - 1; };
  Malha.prototype.t = function (a, b, c) { this.idx.push(a, b, c); };
  Malha.prototype.abrir = function () { this._i0 = this.idx.length; };
  Malha.prototype.fechar = function () { if (this.idx.length > this._i0) this.cascas.push([this._i0, this.idx.length]); };
  Malha.prototype.tri = function () { return this.idx.length / 3; };

  /* ============================================================ OS MATERIAIS E AS COTAS DO CATÁLOGO */
  var MAPA = {
    elet_corrugado:         { tipo: "corrugado", prefixo: "eletroduto_corrugado_amarelo_", nome: "corrugado amarelo leve" },
    elet_corrugado_ref:     { tipo: "corrugado", prefixo: "eletroduto_corrugado_laranja_", nome: "corrugado reforçado laranja" },
    elet_roscavel:          { tipo: "rigido", prefixo: "eletroduto_pvc_roscavel_", luva: "luva_roscavel_", bucha: "bucha_arruela_", nome: "PVC rígido roscável" },
    elet_soldavel:          { tipo: "rigido", prefixo: "eletroduto_pvc_soldavel_", nome: "PVC rígido soldável" },
    elet_flexivel_metalico: { tipo: "espiral", ids: { 20: "eletroduto_flex_metalico_1_2", 25: "eletroduto_flex_metalico_3_4", 32: "eletroduto_flex_metalico_1" }, nome: "flexível metálico (sealtubo)" }
  };
  /* ⚠ PROPORÇÕES DECLARADAS (o catálogo não traz): altura da onda do corrugado = fração da espessura DE−DI, raio da curva do corrugado, luva soldável */
  var ALTURA_ONDA_FRAC = 0.55;   /* sem-fonte-conferir: DN20 → 1,4 mm de profundidade da onda */
  var RAIO_CURVA_FATOR = 4;      /* sem-fonte-conferir: raio de curva do corrugado = 4·DE (usual de obra; o catálogo não dá) */
  var ALTURA_ESPIRAL = 1.3 * MM; /* sem-fonte-conferir: profundidade do sulco da espiral do sealtubo */
  /* L6 (07/11/2026): medido numa casa de 60 trechos com corrugação em todos = ~700 mil triângulos; o teto da cena baixou de 650 mil para 200 mil (o que passa sai liso, na cor certa) */
  var ORCAMENTO = { teto: 200000, usado: 0, cortados: 0 };
  var SEGS = { perto: 10, longe: 8 };

  function itemCat(id) { var C = CAT(); return C ? C.item(id) : null; }
  /* cotas do eletroduto (mm): { tipo, de, di, e, passo, altura, barra, luva:{L,od}, bucha:{rosca,altura,arruela}, niveis{}, fonte, aConferir } */
  function cotas(material, dn) {
    var M = MAPA[material]; if (!M) return null;
    dn = num(dn, 25);
    var id = M.ids ? M.ids[dn] : M.prefixo + dn, it = id ? itemCat(id) : null, c = it ? it.cotas : {}, niv = it && it.cotas_nivel ? it.cotas_nivel : {}, nivItem = it && it.fonte ? it.fonte.nivel : "sem-fonte-conferir";
    var o = { material: material, dn: dn, tipo: M.tipo, id: it ? id : null, niveis: {}, fonte: it ? it.fonte : null, aConferir: !it || nivItem === "sem-fonte-conferir" };
    function nv(k) { return niv[k] || nivItem; }
    if (M.tipo === "corrugado") {
      o.de = num(c.diametro_externo_mm, dn); o.di = num(c.diametro_interno_mm, dn * 0.78); o.e = num(c.espessura_mm, (o.de - o.di) / 2);
      o.passo = num(c.passo_ondulacao_mm, 0.2 * dn); o.altura = ALTURA_ONDA_FRAC * (o.de - o.di) / 2;
      o.niveis = { de: nv("diametro_externo_mm"), di: nv("diametro_interno_mm"), passo: nv("passo_ondulacao_mm"), altura: "sem-fonte-conferir" };
      if (!it) o.aConferir = true;
    } else if (M.tipo === "espiral") {
      o.de = num(c.diametro_externo_mm, dn + 1); o.passo = num(c.passo_espiral_mm, 7); o.di = o.de - 4; o.e = 2; o.altura = ALTURA_ESPIRAL / MM;
      o.niveis = { de: nv("diametro_externo_mm"), passo: nv("passo_espiral_mm"), di: "sem-fonte-conferir" }; o.aConferir = true;
    } else {
      o.de = num(c.diametro_externo_mm != null ? c.diametro_externo_mm : c.diametro_externo_medio_mm, dn); o.e = num(c.espessura_mm, 0.08 * o.de); o.di = o.de - 2 * o.e;
      o.barra = num(c.comprimento_barra_mm, 3000); o.niveis = { de: nv("diametro_externo_mm"), e: nv("espessura_mm"), barra: nv("comprimento_barra_mm") };
      var lv = M.luva ? itemCat(M.luva + dn) : null;
      if (lv) o.luva = { L: lv.cotas.comprimento_mm, od: lv.cotas.diametro_externo_mm, nivel: (lv.cotas_nivel && lv.cotas_nivel.diametro_externo_mm) || lv.fonte.nivel, id: lv.id };
      else o.luva = { L: 2 * (0.5 * o.de + 6), od: 1.22 * o.de + 3, nivel: "sem-fonte-conferir", id: null };   /* proporção da luva soldável do hidro (HidGeo.PROP) */
      var bu = M.bucha ? itemCat(M.bucha + dn) : null;
      o.bucha = bu ? { rosca: bu.cotas.diametro_rosca_mm, altura: bu.cotas.altura_bucha_mm, arruela: bu.cotas.espessura_arruela_mm, nivel: bu.fonte.nivel, id: bu.id }
                   : { rosca: o.de, altura: 10, arruela: 3, nivel: "sem-fonte-conferir", id: null };
    }
    return o;
  }

  /* ============================================================ O EIXO (reta + curvas de canto) */
  /* cam = { L, marcas[], em(s) → {p,t,u,v}, inicio, fim } — o quadro (u,v) é o transporte paralelo, em FORMA FECHADA (a rotação do arco em torno do
     eixo do canto): o anel de saída e o de entrada de uma mesma casca caem nos mesmos pontos. */
  function montarCaminho(P1, P2, c1, c2) {
    /* c1/c2 = { C (o nó), dleg (do nó ao longo deste trecho), dn (do nó ao longo do vizinho), Rb, tl, del } ou null */
    var d = nrmz(sub(P2, P1)), Ltot = len(sub(P2, P1)), s = 0;
    function arco(c, entrando) {
      /* a metade do arco, do ponto médio M até a tangente T (entrando) ou o inverso */
      var tau = mul(c.dleg, -1), T = add(c.C, mul(c.dleg, c.tl)), bis = nrmz(add(c.dleg, c.dn)), O = add(c.C, mul(bis, c.Rb / Math.cos(c.del / 2)));
      var a = nrmz(sub(T, O)), meia = c.del / 2, La = c.Rb * meia;
      function ponto(phi) { return add(O, mul(add(mul(a, Math.cos(phi)), mul(tau, Math.sin(phi))), c.Rb)); }
      function tang(phi) { var t = add(mul(a, -Math.sin(phi)), mul(tau, Math.cos(phi))); return entrando ? mul(t, -1) : t; }   /* "frente" = em direção ao vizinho */
      return { La: La, ponto: ponto, tang: tang, meia: meia };
    }
    var a1 = c1 ? arco(c1, true) : null, a2 = c2 ? arco(c2, false) : null;
    var tl1 = c1 ? c1.tl : 0, tl2 = c2 ? c2.tl : 0, Ls = Math.max(1e-6, Ltot - tl1 - tl2);
    var lista = [];
    if (a1) lista.push({ k: "arco", a: a1, entrando: true, L: a1.La });
    lista.push({ k: "reta", L: Ls, p0: add(P1, mul(d, tl1)) });
    if (a2) lista.push({ k: "arco", a: a2, entrando: false, L: a2.La });
    lista.forEach(function (g) {
      g.s0 = s; g.s1 = s + g.L; s = g.s1;
      if (g.k === "reta") { g.t0 = d; g.t1 = d; g.eixo = null; g.ang = 0; }
      else {
        g.t0 = g.a.tang(g.entrando ? g.a.meia : 0); g.t1 = g.a.tang(g.entrando ? 0 : g.a.meia);
        var cz = cross(g.t0, g.t1), cs = Math.max(-1, Math.min(1, dot(g.t0, g.t1)));
        g.ang = Math.acos(cs); g.eixo = len(cz) > 1e-9 ? nrmz(cz) : perp(g.t0);
      }
    });
    var uAtual = perp(lista[0].t0);
    lista.forEach(function (g) {
      g.u0 = uAtual;
      if (g.k === "arco" && g.ang > 1e-9) uAtual = rodrigues(g.u0, g.eixo, g.ang);
    });
    var Ltotal = s, marcas = [0];
    lista.forEach(function (g) {
      if (g.k === "arco") { var n = Math.max(2, Math.ceil(g.ang / (Math.PI / 18))); for (var q = 1; q < n; q++) marcas.push(g.s0 + g.L * q / n); }
      marcas.push(g.s1);
    });
    function em(sx) {
      if (sx < 0) sx = 0; if (sx > Ltotal) sx = Ltotal;
      var g = lista[lista.length - 1], i;
      for (i = 0; i < lista.length; i++) if (sx <= lista[i].s1 + 1e-12) { g = lista[i]; break; }
      var f = g.L > 1e-12 ? (sx - g.s0) / g.L : 0, p, t, u;
      if (g.k === "reta") { p = add(g.p0, mul(d, sx - g.s0)); t = d; u = g.u0; }
      else {
        var phi = g.entrando ? g.a.meia * (1 - f) : g.a.meia * f;
        p = g.a.ponto(phi); t = nrmz(g.a.tang(phi)); u = g.ang > 1e-9 ? rodrigues(g.u0, g.eixo, g.ang * f) : g.u0;
      }
      return { p: p, t: t, u: u, v: cross(t, u) };
    }
    return { L: Ltotal, marcas: marcas, em: em, inicio: em(0).p, fim: em(Ltotal).p, curvas: (c1 ? 1 : 0) + (c2 ? 1 : 0), d: d, retaL: Ls, c1: c1, c2: c2 };
  }

  /* ============================================================ A SUPERFÍCIE DE REVOLUÇÃO OCA (casca fechada)
     ext = [[s, r], …] (s crescente, metros): o perfil de fora; int = [[s, r], …] o do furo; faixas com normal PRÓPRIA (aresta viva) quando viva=true.
     Sólido FECHADO: faixas de fora (normal para fora), tampas anulares nas duas pontas, faixas do furo (normal para dentro). */
  function casca(m, cam, ext, int, segs, viva) {
    m.abrir();
    var cache = {};
    function quadro(s) { var k = String(s); return cache[k] || (cache[k] = cam.em(s)); }
    var cs = [], sn = [], th;
    for (th = 0; th < segs; th++) { cs.push(Math.cos(2 * Math.PI * th / segs)); sn.push(Math.sin(2 * Math.PI * th / segs)); }
    function ponto(fr, r, j) { var rad = add(mul(fr.u, cs[j]), mul(fr.v, sn[j])); return { p: add(fr.p, mul(rad, r)), rad: rad }; }
    function faixas(perfil, dentro) {
      var i, j;
      for (i = 0; i < perfil.length - 1; i++) {
        var a = perfil[i], b = perfil[i + 1], ds = b[0] - a[0], dr = b[1] - a[1], Lh = Math.sqrt(ds * ds + dr * dr);
        if (Lh < 1e-12) continue;
        var ns = -dr / Lh, nr = ds / Lh, fa = quadro(a[0]), fb = quadro(b[0]), A = [], B = [];
        for (j = 0; j < segs; j++) {
          var pa = ponto(fa, a[1], j), pb = ponto(fb, b[1], j);
          var na = add(mul(pa.rad, nr), mul(fa.t, ns)), nb = add(mul(pb.rad, nr), mul(fb.t, ns));
          if (dentro) { na = mul(na, -1); nb = mul(nb, -1); }
          A.push(m.v(pa.p, na)); B.push(m.v(pb.p, nb));
        }
        for (j = 0; j < segs; j++) {
          var j3 = (j + 1) % segs;
          if (!dentro) { m.t(A[j], A[j3], B[j]); m.t(A[j3], B[j3], B[j]); }
          else { m.t(A[j], B[j], A[j3]); m.t(A[j3], B[j], B[j3]); }
        }
      }
    }
    faixas(ext, false); faixas(int, true);
    /* tampas anulares nas duas pontas (normal ao longo do eixo, para fora do sólido) */
    [[ext[0], int[0], -1], [ext[ext.length - 1], int[int.length - 1], +1]].forEach(function (q) {
      var fr = quadro(q[0][0]), O = [], I = [], j, n = mul(fr.t, q[2]);
      for (j = 0; j < segs; j++) { O.push(m.v(ponto(fr, q[0][1], j).p, n)); I.push(m.v(ponto(fr, q[1][1], j).p, n)); }
      for (j = 0; j < segs; j++) {
        var j3 = (j + 1) % segs;
        if (q[2] < 0) { m.t(O[j], I[j], O[j3]); m.t(O[j3], I[j], I[j3]); } else { m.t(O[j], O[j3], I[j]); m.t(O[j3], I[j3], I[j]); }
      }
    });
    m.fechar();
  }

  /* a espiral do flexível metálico: raio r(s, θ) = ro − h·onda(fase) com fase = (s + passo·θ/2π)/passo; normais pelo gradiente */
  function cascaEspiral(m, cam, L, ro, ri, passo, h, segs) {
    m.abrir();
    var nAn = Math.max(2, Math.ceil(L / (passo / 4))), i, j, cs = [], sn = [];
    for (j = 0; j < segs; j++) { cs.push(Math.cos(2 * Math.PI * j / segs)); sn.push(Math.sin(2 * Math.PI * j / segs)); }
    function raio(s, th) { var fase = (s + passo * th / (2 * Math.PI)) / passo; return ro - h * (0.5 - 0.5 * Math.cos(2 * Math.PI * fase)); }
    function dRds(s, th) { var fase = (s + passo * th / (2 * Math.PI)) / passo; return -h * 0.5 * Math.sin(2 * Math.PI * fase) * 2 * Math.PI / passo; }
    var an = [];
    for (i = 0; i <= nAn; i++) {
      var s = i === nAn ? L : L * i / nAn, fr = cam.em(s), linha = [];
      for (j = 0; j < segs; j++) {
        var th = 2 * Math.PI * j / segs, rad = add(mul(fr.u, cs[j]), mul(fr.v, sn[j])), thh = add(mul(fr.u, -sn[j]), mul(fr.v, cs[j])), r = raio(s, th), rs = dRds(s, th), rt = rs * passo / (2 * Math.PI);
        var n = nrmz(add(add(rad, mul(fr.t, -rs)), mul(thh, -rt / r)));
        linha.push(m.v(add(fr.p, mul(rad, r)), n));
      }
      an.push(linha);
    }
    for (i = 0; i < nAn; i++) for (j = 0; j < segs; j++) { var j3 = (j + 1) % segs; m.t(an[i][j], an[i][j3], an[i + 1][j]); m.t(an[i][j3], an[i + 1][j3], an[i + 1][j]); }
    /* furo e tampas */
    var f0 = cam.em(0), f1 = cam.em(L), I0 = [], I1 = [], O0 = [], O1 = [];
    for (j = 0; j < segs; j++) {
      var q0 = add(mul(f0.u, cs[j]), mul(f0.v, sn[j])), q1 = add(mul(f1.u, cs[j]), mul(f1.v, sn[j]));
      O0.push(m.v(add(f0.p, mul(q0, raio(0, 2 * Math.PI * j / segs))), mul(f0.t, -1))); I0.push(m.v(add(f0.p, mul(q0, ri)), mul(f0.t, -1)));
      O1.push(m.v(add(f1.p, mul(q1, raio(L, 2 * Math.PI * j / segs))), f1.t)); I1.push(m.v(add(f1.p, mul(q1, ri)), f1.t));
    }
    var Pi0 = [], Pi1 = [];
    for (j = 0; j < segs; j++) {
      var r0 = add(mul(f0.u, cs[j]), mul(f0.v, sn[j])), r1 = add(mul(f1.u, cs[j]), mul(f1.v, sn[j]));
      Pi0.push(m.v(add(f0.p, mul(r0, ri)), mul(r0, -1))); Pi1.push(m.v(add(f1.p, mul(r1, ri)), mul(r1, -1)));
    }
    for (j = 0; j < segs; j++) {
      var k3 = (j + 1) % segs;
      m.t(O0[j], I0[j], O0[k3]); m.t(O0[k3], I0[j], I0[k3]); m.t(O1[j], O1[k3], I1[j]); m.t(O1[k3], I1[k3], I1[j]);
      m.t(Pi0[j], Pi1[j], Pi0[k3]); m.t(Pi0[k3], Pi1[j], Pi1[k3]);
    }
    m.fechar();
  }

  /* ============================================================ A REDE DO RENDER (vizinhos, caixas) */
  var REG = { R: null, porId: null, grade: null, caixas: [] };
  function celula(P) { return Math.floor(P[0] / 0.05) + "," + Math.floor(P[1] / 0.05) + "," + Math.floor(P[2] / 0.05); }
  /* as famílias de caixa ele-caixa-* (L2a) SÃO a caixa do ponto (mep: caixa_4x2): o caixote de cada uma, no mundo (centro e meia-aresta) */
  function caixasDeFamilia(estado, avaliarFam) {
    var out = [];
    if (!estado || typeof avaliarFam !== "function") return out;
    arr(estado.familias).forEach(function (f) {
      if (!f || String(f.famId || "").indexOf("ele-caixa") !== 0) return;
      var av = null; try { av = avaliarFam(f.famId, f.tipoId, f.inst || {}); } catch (e) { av = null; }
      var b = av && av.caixa; if (!b) return;
      var cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, r = num(f.rotY, 0), co = Math.cos(r), si = Math.sin(r);
      out.push({ id: f.id, c: [num(f.x, 0) + cx * co + cz * si, num(f.y, 0) + (b.y0 + b.y1) / 2, num(f.z, 0) - cx * si + cz * co], meia: Math.max(b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0) / 2 });
    });
    return out;
  }
  function registrarRede(R, estado, avaliarFam) {
    REG.R = R || null; REG.porId = null; REG.grade = null; ORCAMENTO.usado = 0; ORCAMENTO.cortados = 0;
    try { REG.caixas = caixasDeFamilia(estado, avaliarFam); } catch (e) { REG.caixas = []; }
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function indice() {
    if (REG.grade || !REG.R) return;
    REG.porId = {}; REG.grade = {};
    (REG.R.trechos || []).forEach(function (t) {
      REG.porId[t.id] = t;
      [pv(t.p1), pv(t.p2)].forEach(function (P, lado) { var k = celula(P); (REG.grade[k] = REG.grade[k] || []).push({ t: t, lado: lado }); });
    });
  }
  function noEm(P, excl) {
    indice(); if (!REG.grade) return [];
    var out = [], i, j, k, cx = Math.floor(P[0] / 0.05), cy = Math.floor(P[1] / 0.05), cz = Math.floor(P[2] / 0.05);
    for (i = -1; i <= 1; i++) for (j = -1; j <= 1; j++) for (k = -1; k <= 1; k++) {
      var L = REG.grade[(cx + i) + "," + (cy + j) + "," + (cz + k)]; if (!L) continue;
      L.forEach(function (e) {
        if (e.t === excl || e.t.id === (excl && excl.id)) return;
        var Q = pv(e.lado ? e.t.p2 : e.t.p1); if (len(sub(Q, P)) <= 0.02) out.push(e);
      });
    }
    return out;
  }
  function trechoNaRede(t) {
    indice(); if (!REG.porId) return false;
    var r = REG.porId[t.id]; if (!r) return false;
    return len(sub(pv(r.p1), pv(t.p1))) < 1e-4 && len(sub(pv(r.p2), pv(t.p2))) < 1e-4;
  }
  /* a caixa (peça "caixa_*") que recebe a ponta P do tubo */
  function caixaEm(P) {
    for (var q = 0; q < REG.caixas.length; q++) {
      var k0 = REG.caixas[q], m = k0.meia + 0.03;
      if (Math.abs(P[0] - k0.c[0]) <= m && Math.abs(P[1] - k0.c[1]) <= m && Math.abs(P[2] - k0.c[2]) <= m) return { id: k0.id, familia: true };
    }
    if (!REG.R) return null;
    var ps = REG.R.pecas || [], i;
    for (i = 0; i < ps.length; i++) {
      var k = ps[i]; if (!k || String(k.peca || "").indexOf("caixa") !== 0) continue;
      var h = k.hub || {}, rr = num(h.r, 0.08) + 0.03, yb = num(h.yBot, num(k.y, 0) - 0.06) - 0.05, yt = num(h.yTop, num(k.y, 0) + 0.06) + 0.05;
      if (Math.abs(num(k.x, 0) - P[0]) <= rr && Math.abs(num(k.z, 0) - P[2]) <= rr && P[1] >= yb && P[1] <= yt) return k;
    }
    return null;
  }
  var FLEX = { elet_corrugado: 1, elet_corrugado_ref: 1, elet_flexivel_metalico: 1 };
  /* o canto contínuo: o nó tem SÓ este trecho e mais um, ambos flexíveis, sem caixa ali, e o ângulo de desvio entre ~2° e ~170° */
  function canto(t, lado, P, d, Ltrecho, c) {
    var viz = noEm(P, t);
    if (viz.length !== 1) return null;
    var e = viz[0], vt = e.t; if (!FLEX[vt.material] || vt.sistema !== t.sistema) return null;
    if (caixaEm(P)) return null;
    var Q = pv(e.lado ? vt.p1 : vt.p2), dn = nrmz(sub(Q, P)), Lv = len(sub(Q, P)), dleg = lado ? mul(d, -1) : d;
    var ent = nrmz(dleg), cosg = Math.max(-1, Math.min(1, dot(ent, dn))), del = Math.PI - Math.acos(cosg);
    if (del < 0.035 || del > Math.PI - 0.17) return null;
    var Rb = RAIO_CURVA_FATOR * c.de * MM, tl = Rb * Math.tan(del / 2), lim = 0.45 * Math.min(Ltrecho, Lv);
    if (tl > lim) { tl = lim; Rb = tl / Math.tan(del / 2); }
    return { C: P, dleg: dleg, dn: dn, Rb: Rb, tl: tl, del: del };
  }

  /* o eixo real de um trecho (m): reta ou reta com as curvas contínuas dos cantos (só os flexíveis) */
  function caminho(t, o) {
    o = o || {};
    var c = cotas(t.material, t.dn); if (!c) return null;
    var P1 = pv(t.p1), P2 = pv(t.p2), d = nrmz(sub(P2, P1)), Ltot = len(sub(P2, P1));
    if (Ltot < 1e-6) return null;
    var r1 = Math.max(0, num(o.recuo1, 0)), r2 = Math.max(0, num(o.recuo2, 0));
    if (r1 + r2 > Ltot - 0.002) { var k = (Ltot - 0.002) / Math.max(1e-9, r1 + r2); r1 *= Math.max(0, k); r2 *= Math.max(0, k); }
    var A = add(P1, mul(d, r1)), B = sub(P2, mul(d, r2)), c1 = null, c2 = null;
    if (FLEX[t.material] && r1 === 0 && r2 === 0 && trechoNaRede(t)) { c1 = canto(t, 0, P1, d, Ltot, c); c2 = canto(t, 1, P2, d, Ltot, c); }
    var cam = montarCaminho(A, B, c1, c2); cam.cotas = c; cam.A = A; cam.B = B; cam.P1 = P1; cam.P2 = P2;
    return cam;
  }

  /* ============================================================ O TUBO */
  var CACHE = { m: new Map(), tris: 0, MAX_TRIS: 600000, acertos: 0, faltas: 0 };
  function rq(v) { return Math.round(v * 1e5) / 1e5; }
  function transl(partes, T) {
    return partes.map(function (pt) {
      var ml = pt.malha, n = Object.create(Malha.prototype), ps = ml.pos, q = new Array(ps.length), i;
      n.nrm = ml.nrm; n.idx = ml.idx; n.cascas = ml.cascas;
      for (i = 0; i < ps.length; i += 3) { q[i] = ps[i] + T[0]; q[i + 1] = ps[i + 1] + T[1]; q[i + 2] = ps[i + 2] + T[2]; }
      n.pos = q; return { papel: pt.papel, malha: n };
    });
  }
  function trisDe(partes) { var n = 0; partes.forEach(function (p) { n += p.malha.idx.length / 3; }); return n; }

  function gerar(t, o, lod, cam, c, caixa1, caixa2) {
    var partes = [], juntas = [], mT = new Malha(), M = MAPA[t.material], segs = SEGS[lod] || SEGS.perto, L = cam.L, ro = c.de * MM / 2, ri = c.di * MM / 2, i;
    var intp = cam.marcas.map(function (s) { return [s, ri]; }), info = {};
    if (M.tipo === "corrugado") {
      var h = c.altura * MM;
      if (lod === "perto") {
        var passo = c.passo * MM, N = 2 * Math.max(1, Math.floor(L / passo)), est = [];
        for (i = 0; i <= N; i++) est.push([i === N ? L : L * i / N, i % 2 === 0 ? ro : ro - h]);
        casca(mT, cam, est, intp, segs, true);
        info = { aneis: N / 2 + 1, passoReal: L / (N / 2), onda: true };
      } else {
        var rm = ro - 0.35 * h; casca(mT, cam, cam.marcas.map(function (s) { return [s, rm]; }), intp, segs, false);
        info = { aneis: 0, onda: false };
      }
    } else if (M.tipo === "espiral") {
      if (lod === "perto") { cascaEspiral(mT, cam, L, ro, ri, c.passo * MM, ALTURA_ESPIRAL, 16); info = { espiral: true, passo: c.passo }; }
      else { casca(mT, cam, cam.marcas.map(function (s) { return [s, ro - 0.4 * ALTURA_ESPIRAL]; }), intp, segs, false); info = { espiral: false }; }
    } else {   /* rígido */
      casca(mT, cam, cam.marcas.map(function (s) { return [s, ro]; }), intp, segs, false);
      info = { liso: true };
    }
    partes.push({ papel: "corpo", malha: mT });
    if (M.tipo === "rigido") {
      var mL = new Malha(), mB = new Malha(), sg = SEGS[lod] ? Math.max(12, SEGS[lod]) : 12, barra = c.barra * MM, Lm = c.luva.L * MM, odR = c.luva.od * MM / 2, ch = Math.min(1.2 * MM, Lm / 6);
      for (var s = barra; s < L - 0.05; s += barra) {
        var cm = montarCaminho(add(cam.A, mul(cam.d, s - Lm / 2)), add(cam.A, mul(cam.d, s + Lm / 2)), null, null);
        casca(mL, cm, [[0, ro + 0.0004], [ch, odR], [Lm - ch, odR], [Lm, ro + 0.0004]], [[0, ro], [Lm, ro]], sg, false);
        juntas.push({ s: s, tipo: "luva" });
      }
      if (mL.idx.length) partes.push({ papel: "luva", malha: mL });
      [[caixa2, cam.B, cam.d, true], [caixa1, cam.A, mul(cam.d, -1), false]].forEach(function (q) {
        if (!q[0]) return;
        var bu = c.bucha, rr = bu.rosca * MM / 2, Hb = bu.altura * MM, Ea = bu.arruela * MM, E = q[1], dir = q[2];
        /* arruela por fora da parede (encostada na face), bucha com aba por dentro da caixa */
        var ca = montarCaminho(add(E, mul(dir, -Ea - 0.0003)), add(E, mul(dir, -0.0003)), null, null), cb = montarCaminho(E, add(E, mul(dir, Hb)), null, null);
        casca(mB, ca, [[0, rr + 0.0035], [Ea, rr + 0.0035]], [[0, ro * 0.98], [Ea, ro * 0.98]], 16, false);
        casca(mB, cb, [[0, rr + 0.0035], [1.5 * MM, rr + 0.0035], [1.5 * MM, rr + 0.0008], [Hb, rr + 0.0008]], [[0, ri], [Hb, ri]], 16, false);
        juntas.push({ s: q[3] ? L : 0, tipo: "bucha" });
      });
      if (mB.idx.length) partes.push({ papel: "elet_aluminio", malha: mB });
    }
    return { partes: partes, juntas: juntas, info: info };
  }

  function tubo(t, o) {
    var M = t && MAPA[t.material]; if (!M || !t.p1 || !t.p2) return null;
    o = o || {};
    var c = cotas(t.material, t.dn); if (!c) return null;
    var cam = caminho(t, o); if (!cam) return null;
    var lod = o.lod === "longe" || o.lod === "icone" ? "longe" : "perto";
    /* a estimativa de triângulos decide ANTES: acima do orçamento da reconstrução, o tubo sai simples */
    var est = 0;
    if (lod === "perto") {
      if (M.tipo === "corrugado") est = Math.round(cam.L / (c.passo * MM)) * 2 * SEGS.perto * 2 + 100;
      else if (M.tipo === "espiral") est = Math.round(cam.L / (c.passo * MM / 4)) * 16 * 2 + 200;
      if (est && ORCAMENTO.usado + est > ORCAMENTO.teto) { lod = "longe"; ORCAMENTO.cortados++; est = 0; }
    }
    var caixa1 = M.tipo === "rigido" ? caixaEm(cam.P1) : null, caixa2 = M.tipo === "rigido" ? caixaEm(cam.P2) : null;
    function cj(cc) { return cc ? [rq(cc.dn[0]), rq(cc.dn[1]), rq(cc.dn[2]), rq(cc.tl), rq(cc.Rb), rq(cc.C[0] - cam.P1[0]), rq(cc.C[1] - cam.P1[1]), rq(cc.C[2] - cam.P1[2])] : 0; }
    var chave = JSON.stringify([t.material, num(t.dn, 0), lod, rq(cam.P2[0] - cam.P1[0]), rq(cam.P2[1] - cam.P1[1]), rq(cam.P2[2] - cam.P1[2]),
      rq(cam.A[0] - cam.P1[0]), rq(cam.A[1] - cam.P1[1]), rq(cam.A[2] - cam.P1[2]), rq(cam.B[0] - cam.P1[0]), rq(cam.B[1] - cam.P1[1]), rq(cam.B[2] - cam.P1[2]),
      cj(cam.c1), cj(cam.c2), caixa1 ? 1 : 0, caixa2 ? 1 : 0]);
    var P1 = cam.P1, g = CACHE.m.get(chave);
    if (g) { CACHE.acertos++; CACHE.m.delete(chave); CACHE.m.set(chave, g); }
    else {
      CACHE.faltas++;
      var rel = gerar(t, o, lod, cam, c, caixa1, caixa2);
      g = { partes: transl(rel.partes, mul(P1, -1)), juntas: rel.juntas, info: rel.info, inicio: sub(cam.inicio, P1), fim: sub(cam.fim, P1) };
      CACHE.m.set(chave, g); CACHE.tris += trisDe(g.partes);
      while (CACHE.tris > CACHE.MAX_TRIS && CACHE.m.size > 1) { var k0 = CACHE.m.keys().next().value, v0 = CACHE.m.get(k0); CACHE.tris -= trisDe(v0.partes); CACHE.m.delete(k0); }
    }
    var partes = transl(g.partes, P1), tris = trisDe(partes);
    ORCAMENTO.usado += tris;
    var HGg = HG(), cotasH = HGg ? HGg.cotasTubo(t.material, t.dn, t.classe) : { de: c.de, e: c.e };
    return { partes: partes, cotas: cotasH, juntas: g.juntas.map(function (j) { return { s: j.s, tipo: j.tipo }; }), inicio: add(g.inicio, P1), fim: add(g.fim, P1), aConferir: c.aConferir,
             ele: { lod: lod, tipo: M.tipo, tris: tris, info: g.info, catalogo: c, curvas: cam.curvas, comprimento: cam.L } };
  }

  function zerarOrcamento() { ORCAMENTO.usado = 0; ORCAMENTO.cortados = 0; }
  function configurar(o) { o = o || {}; if (o.orcamento != null) ORCAMENTO.teto = num(o.orcamento, ORCAMENTO.teto); }
  function estatisticas() { return { orcamentoTeto: ORCAMENTO.teto, usado: ORCAMENTO.usado, cortados: ORCAMENTO.cortados, cacheTris: CACHE.tris, cacheItens: CACHE.m.size, acertos: CACHE.acertos, faltas: CACHE.faltas }; }
  function limparCache() { CACHE.m.clear(); CACHE.tris = 0; CACHE.acertos = 0; CACHE.faltas = 0; }

  /* ============================================================ LIGAÇÃO COM O BIMINST (sem editar o biminst) */
  /* cores do produto: as do catálogo, assentadas pelo print (a caixa amarela do L2a usa o mesmo tom) */
  var COR = { elet_corrugado: "#E3B400", elet_corrugado_ref: "#DD6A12", elet_roscavel: "#26272A", elet_soldavel: "#B8B8B2", elet_flexivel_metalico: "#2B2B2B" };
  function instalar() {
    var G = HG(), I = dep("BimInst", "./biminst.js");
    if (G && G.APAR) {
      Object.keys(COR).forEach(function (k) {
        var base = G.APAR[k] || { rug: 0.55, met: 0, verniz: 0, env: 0.5 };
        G.APAR[k] = { cor: COR[k], rug: k === "elet_flexivel_metalico" ? 0.7 : (k.indexOf("corrugado") >= 0 ? 0.5 : base.rug), met: 0, verniz: 0, env: 0.5,
                      nome: (MAPA[k] ? "eletroduto " + MAPA[k].nome : base.nome) };
      });
      if (G.PAPEL) G.PAPEL.elet_aluminio = { cor: "#B9BEC4", rug: 0.38, met: 0.85, verniz: 0, nome: "bucha e arruela de alumínio" };
      if (G.JUNTA) G.JUNTA.elet_flexivel_metalico = "eletro";
    }
    if (I && I.MATERIAIS && !I.MATERIAIS.elet_flexivel_metalico) {
      I.MATERIAIS.elet_flexivel_metalico = { nome: "Eletroduto flexível metálico com capa de PVC (sealtubo)", norma: "catálogo de fabricante (cotas sem-fonte-conferir)", dns: [20, 25, 32], dn: 20, flexivel: true, semSinapi: true };
      var S = I.SISTEMAS && I.SISTEMAS.eletrica;
      if (S && S.materiais.indexOf("elet_flexivel_metalico") < 0) S.materiais.push("elet_flexivel_metalico");
    }
    /* a última rede do render (vizinhos e caixas): embrulha BimInst.rede uma vez */
    if (I && typeof I.rede === "function" && !I.rede._eleGeo) {
      var orig = I.rede, emb = function (estado, avaliarFam) { var R = orig.apply(this, arguments); try { registrarRede(R, estado, avaliarFam); } catch (e) {} return R; };
      emb._eleGeo = true; I.rede = emb;
    }
    /* B2 (revisão 07/11/2026): o teto de triângulos zera a cada RECONSTRUÇÃO do desenho (BimInstUI.malhas), não só quando a rede muda — o re-render de tubo sem rede nova acumulava o "usado" até tudo sair liso */
    var U = global.BimInstUI;
    if (U && typeof U.malhas === "function" && !U.malhas._eleGeoOrc) {
      var om = U.malhas, ew = function () { ORCAMENTO.usado = 0; ORCAMENTO.cortados = 0; return om.apply(this, arguments); };
      ew._eleGeoOrc = true; for (var kk in om) if (Object.prototype.hasOwnProperty.call(om, kk)) ew[kk] = om[kk]; U.malhas = ew;
    }
  }

  var EleGeo = { VERSAO: 1, MAPA: MAPA, ORCAMENTO: ORCAMENTO, SEGS: SEGS, COR: COR, ALTURA_ONDA_FRAC: ALTURA_ONDA_FRAC, RAIO_CURVA_FATOR: RAIO_CURVA_FATOR,
                 tubo: tubo, caminho: caminho, cotas: cotas, registrarRede: registrarRede, zerarOrcamento: zerarOrcamento, configurar: configurar, estatisticas: estatisticas, limparCache: limparCache, instalar: instalar,
                 Malha: Malha, caixaEm: caixaEm, redeAtual: function () { return REG.R; }, _montarCaminho: montarCaminho, _casca: casca, ehFlexivel: function (m) { return !!FLEX[m]; } };
  global.EleGeo = EleGeo;
  if (typeof module !== "undefined" && module.exports) module.exports = EleGeo;
  try { instalar(); } catch (eI) {}
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));

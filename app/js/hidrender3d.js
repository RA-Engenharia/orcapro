/* =====================================================================
 * hidrender3d.js — HIDRO-3D: o ISOMÉTRICO por ambiente como RENDER do modelo 3D (tubos sólidos, conexões 3D reais, arquitetura
 * transparente com aresta fina), como o detalhe do Revit / a folha da Tânia.
 *
 *   HidRender3D.cena(c, pz, opcoes) → cena (JSON puro, Node-testável, SEM THREE): as MALHAS da rede modelada (as MESMAS que o 3D do BIM
 *       desenha: HidGeo.no / HidGeo.tubo / HidGeo.peca / HidGeo.registro de js/biminstgeo.js), a arquitetura em prismas, as linhas das
 *       louças e a matriz da projeção isométrica a 30° do isométrico vetorial (js/hidpranchas.js perspectivaDe): o balão projetado em
 *       cima do raster cai exatamente na peça.
 *   HidRender3D.renderizar(THREE, cena, opcoes) → canvas (no navegador: é o MESMO código do app e da ferramenta tools/hidro-render3d.js)
 *
 * ⚠ Só desenha o que está modelado: tubo, conexão, peça (caixa/ralo/terminal) e registro da rede; nada é acrescentado.
 *   Peça cuja geometria não existe na biblioteca (HidGeo devolve nulo) entra em `cena.semMalha` — o chamador avisa.
 * ===================================================================== */
(function (global) {
  "use strict";
  /* hid:geometria-inicio — módulo de DESENHO (mm de papel, px, proporção de vista, cores): nenhum valor de norma aqui (valor de norma vem só da biblioteca de normas, fora deste módulo) */
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { return null; } } return null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function r5(v) { return Math.round(v * 1e5) / 1e5; }

  /* a malha do HidGeo (pos/nrm/idx em metros, mundo) → registro leve */
  function malha(ml, tipo, sis, cor, id, extra) {
    if (!ml || !ml.pos || !ml.idx || !ml.pos.length) return null;
    var o = { tipo: tipo, sis: sis, cor: cor, id: id, pos: Array.prototype.map.call(ml.pos, r5), nrm: Array.prototype.map.call(ml.nrm, function (v) { return Math.round(v * 1000) / 1000; }), idx: Array.prototype.slice.call(ml.idx) };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function prismaMalha(pl, y0, y1) {   /* parede/laje: prisma de base poligonal convexa */
    var n = pl.length, pos = [], idx = [], i;
    for (i = 0; i < n; i++) pos.push(pl[i][0], y0, pl[i][1]);
    for (i = 0; i < n; i++) pos.push(pl[i][0], y1, pl[i][1]);
    for (i = 1; i + 1 < n; i++) { idx.push(0, i, i + 1); idx.push(n, n + i + 1, n + i); }
    for (i = 0; i < n; i++) { var j = (i + 1) % n; idx.push(i, j, n + j); idx.push(i, n + j, n + i); }
    return { pos: pos.map(r5), idx: idx };
  }

  /* ---- a cena: a rede MODELADA recortada pela caixa do ambiente (a mesma do isométrico vetorial) ---- */
  var COR_TAMPA = "#b9b9b9";   /* R05: tampa de caixa (ferro/concreto) em cinza claro — o cinza-escuro virava disco preto na planta (folha de referência: nada de mancha preta) */
  function cena(c, pz, o) {
    o = o || {};
    var BI = dep("BimInst", "./biminst.js"), G = dep("HidGeo", "./biminstgeo.js"), HCI = dep("HidCI", "./hidcigeo.js"), HVG = dep("HidVentGeo", "./hidventgeo.js");
    var out = { malhas: [], arq: [], louca: [], semMalha: [], vista: pz.vista, aviso: [] };
    if (!BI || !G) { out.aviso.push("HidGeo/BimInst indisponíveis: sem malhas 3D."); return out; }
    var cores = o.cores || {}, corCx = o.corConexao || "#f4f1ea", corPeca = o.corPeca || "#d8d8d8", corReg = o.corRegistro || "#6b6b6b";
    var R = c.rede, lod = o.lod || "perto", porId = {}, recuos = {}, bolsas = {}, deslocs = {};
    arr(R.trechos).forEach(function (t) { porId[t.id] = t; });
    var P = pz.P;
    /* 1) conexões por nó, com os eixos reais dos tubos (o tubo recua na bolsa) */
    var nos = {}, ordem = [], cxAmb = {};
    pz.itens.forEach(function (it) { if (it.tipo === "conexao") cxAmb[it.cx.id] = 1; });
    arr(R.conexoes).forEach(function (cx) {
      /* o nó inteiro (joelho + redução no mesmo ponto) mesmo que parte esteja fora da lista do ambiente: a chave é a posição */
      var k = cx.x + "," + cx.y + "," + cx.z + "|" + cx.sistema;
      (nos[k] = nos[k] || []).push(cx);
    });
    var cxGeo = {};
    Object.keys(nos).forEach(function (k) {
      var lista = nos[k]; if (!lista.some(function (q) { return cxAmb[q.id]; })) return;
      var M = BI.MATERIAIS[lista[0].material] || {}; if (M.secao) return;
      var r = null; try { r = G.no(lista, porId, { lod: lod, tol: BI.TOL }); } catch (e) { r = null; }
      if (!r) { lista.forEach(function (q) { if (cxAmb[q.id]) out.semMalha.push(q.id); }); return; }
      r.pecas.forEach(function (pc) { cxGeo[pc.id] = { pc: pc, sis: lista[0].sistema }; });
      Object.keys(r.recuos).forEach(function (kk) { recuos[kk] = Math.max(recuos[kk] || 0, r.recuos[kk]); });
      Object.keys(r.bolsas || {}).forEach(function (kk) { bolsas[kk] = r.bolsas[kk]; });
      Object.keys(r.deslocs || {}).forEach(function (kk) { deslocs[kk] = r.deslocs[kk]; });
    });
    /* 2) peças (ralo, caixa sifonada, CI, terminal): bocas na direção e altura dos tubos ligados */
    var pecaGeo = {};
    pz.itens.forEach(function (it) {
      if (it.tipo !== "peca") return;
      var k = it.k, Pc = BI.PECAS[k.peca]; if (!Pc || !/^(ralo_|caixa_sifonada|caixa_inspecao|terminal_ventilacao)/.test(k.peca)) return;
      var lig = arr(R.ligacoes).filter(function (l) { return l.tipo === "peca" && l.alvo === k.id; }).map(function (l) {
        var t = porId[l.trecho]; if (!t) return null;
        var d1 = Math.hypot(t.p1.x - l.x, t.p1.y - l.y, t.p1.z - l.z), d2 = Math.hypot(t.p2.x - l.x, t.p2.y - l.y, t.p2.z - l.z), lado = d1 <= d2 ? 0 : 1;
        var e = lado ? t.p2 : t.p1, f = lado ? t.p1 : t.p2;
        return { trecho: t.id, lado: lado, dn: t.dn, ponto: e, dir: [f.x - e.x, f.y - e.y, f.z - e.z], saida: f.y < e.y - 1e-4 && Math.abs(f.y - e.y) < Math.hypot(f.x - e.x, f.z - e.z) };
      }).filter(Boolean);
      var g = null;
      try { g = k.peca === "caixa_inspecao" ? (HCI ? HCI.geo(k, lig, { lod: lod }) : null) : k.peca === "terminal_ventilacao" ? (HVG ? HVG.terminal(k, { lod: lod }) : null) : G.peca(k, lig, { lod: lod }); } catch (e2) { g = null; }
      if (!g) { out.semMalha.push(k.id); return; }
      pecaGeo[k.id] = g;
      arr(g.portas).forEach(function (p) {
        var t = porId[p.trecho]; if (!t) return;
        var E = p.lado ? t.p2 : t.p1, F = p.lado ? t.p1 : t.p2, u = [F.x - E.x, F.y - E.y, F.z - E.z], L = Math.hypot(u[0], u[1], u[2]); if (!(L > 0)) return;
        u = [u[0] / L, u[1] / L, u[2] / L];
        var kk = null;
        if (p.raio != null) { var ex = E.x - p.centro[0], ez = E.z - p.centro[2], a = u[0] * u[0] + u[2] * u[2], b = ex * u[0] + ez * u[2], cc = ex * ex + ez * ez - p.raio * p.raio; if (a > 1e-9 && b * b - a * cc >= 0) kk = (-b + Math.sqrt(b * b - a * cc)) / a; }
        else if (p.recuoAbs && Math.abs(u[1]) > 1e-6) kk = (p.recuoAbs[1] - E.y) / u[1];
        if (kk != null && kk > 0 && kk < L - 0.01) { var key = p.trecho + ":" + p.lado; recuos[key] = Math.max(recuos[key] || 0, kk); }
      });
    });
    /* 3) tubos (o trecho já recortado na caixa e na altura do isométrico: q1/q2); o recuo só vale na ponta que não foi cortada */
    pz.itens.forEach(function (it) {
      if (it.tipo !== "tubo") return;
      var t = it.t, M = BI.MATERIAIS[t.material] || {}; if (M.secao) return;
      var inteiro1 = it.ta < 1e-6 && Math.abs(it.q1.y - t.p1.y) < 1e-6, inteiro2 = it.tb > 1 - 1e-6 && Math.abs(it.q2.y - t.p2.y) < 1e-6;
      var tt = {}; for (var kx in t) tt[kx] = t[kx]; tt.p1 = it.q1; tt.p2 = it.q2;
      var tg = null;
      try { tg = G.tubo(tt, { recuo1: inteiro1 ? (recuos[t.id + ":0"] || 0) : 0, recuo2: inteiro2 ? (recuos[t.id + ":1"] || 0) : 0, livre1: !inteiro1, livre2: !inteiro2, bolsaAtras1: inteiro1 ? bolsas[t.id + ":0"] : undefined, bolsaAtras2: inteiro2 ? bolsas[t.id + ":1"] : undefined, desloc1: inteiro1 ? deslocs[t.id + ":0"] : undefined, desloc2: inteiro2 ? deslocs[t.id + ":1"] : undefined, lod: lod }); } catch (e3) { tg = null; }
      if (!tg || !tg.partes || !tg.partes.length) { out.semMalha.push(t.id); return; }
      tg.partes.forEach(function (pt, i) { var m = malha(pt.malha, i ? "anel" : "tubo", t.sistema, i ? "#222222" : (cores[t.sistema] || "#888888"), t.id); if (m) out.malhas.push(m); });
    });
    /* 4) conexões (corpo da peça; branco-marfim como nas folhas de referência) */
    pz.itens.forEach(function (it) {
      if (it.tipo !== "conexao") return;
      var gx = cxGeo[it.cx.id]; if (!gx) return;
      gx.pc.partes.forEach(function (pt) { var m = malha(pt.malha, "conexao", it.cx.sistema, pt.papel === "anel" || pt.papel === "borracha" ? "#222222" : corCx, it.cx.id); if (m) out.malhas.push(m); });
    });
    /* 5) peças */
    pz.itens.forEach(function (it) {
      if (it.tipo !== "peca") return;
      var gp = pecaGeo[it.k.id]; if (!gp) return;
      arr(gp.partes).forEach(function (pt) { var m = malha(pt.malha, "peca", it.k.sistema, /grelha|puxador/.test(pt.papel || "") ? "#5a5a5a" : /ferro|tampa/.test(pt.papel || "") ? COR_TAMPA : corPeca, it.k.id); if (m) out.malhas.push(m); });
    });
    /* 6) registros (acessórios do ambiente) */
    arr(pz.acess).forEach(function (a) {
      var V0 = ((BI.ACESSORIOS[a.acessorio] || {}).variantes || {})[a.variante] || {}, rg = null;
      try { rg = G.registro({ centro: a.centro, dir: a.dir, comprimento: a.comprimento, dn: a.dn, material: a.material, variante: a.variante, acessorio: a.acessorio, varMaterial: V0.material }, { lod: lod }); } catch (e4) { rg = null; }
      if (!rg) { out.semMalha.push(a.id); return; }
      arr(rg.partes).forEach(function (pt) { var m = malha(pt.malha, "registro", a.sistema, corReg, a.id); if (m) out.malhas.push(m); });
    });
    /* arquitetura: paredes do fundo (prismas) + piso; louças: as linhas da malha real */
    arr(pz.par3d).forEach(function (w) { var m = prismaMalha(w.pl, w.y0, w.y1); out.arq.push({ pos: m.pos, idx: m.idx }); });
    var b = pz.b, y0 = pz.pv.cota, e = 0.002;
    var pm = prismaMalha([[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]], y0 - e, y0); out.arq.push({ pos: pm.pos, idx: pm.idx, piso: true });
    out.louca = arr(pz.loucas).map(function (sg) { return [sg[0][0], sg[0][1], sg[0][2], sg[1][0], sg[1][1], sg[1][2]].map(r5); });
    /* a projeção: P é linear (u, v, d = x+z+y no quadrante SE): lê os coeficientes pela base */
    var o0 = P({ x: 0, y: 0, z: 0 }), ex = P({ x: 1, y: 0, z: 0 }), ey = P({ x: 0, y: 1, z: 0 }), ez = P({ x: 0, y: 0, z: 1 });
    var au = [ex.u - o0.u, ey.u - o0.u, ez.u - o0.u], bv = [ex.v - o0.v, ey.v - o0.v, ez.v - o0.v], ed = [ex.d - o0.d, ey.d - o0.d, ez.d - o0.d];
    var u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, d0 = Infinity, d1 = -Infinity;
    function acumula(x, y, z) { var u = au[0] * x + au[1] * y + au[2] * z, v = bv[0] * x + bv[1] * y + bv[2] * z, d = ed[0] * x + ed[1] * y + ed[2] * z; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; if (d < d0) d0 = d; if (d > d1) d1 = d; }
    out.malhas.forEach(function (m) { for (var i = 0; i < m.pos.length; i += 3) acumula(m.pos[i], m.pos[i + 1], m.pos[i + 2]); });
    out.arq.forEach(function (m) { for (var i = 0; i < m.pos.length; i += 3) acumula(m.pos[i], m.pos[i + 1], m.pos[i + 2]); });
    out.louca.forEach(function (s) { acumula(s[0], s[1], s[2]); acumula(s[3], s[4], s[5]); });
    var mg = o.margemM != null ? o.margemM : 0.12;
    out.proj = { au: au, bv: bv, ed: ed, u0: u0 - mg, u1: u1 + mg, v0: v0 - mg, v1: v1 + mg, d0: d0 - 0.5, d1: d1 + 0.5 };
    out.viewer = P.viewer;
    out.clip = { x0: b.x0 - (o.folga != null ? o.folga : 0.12), x1: b.x1 + (o.folga != null ? o.folga : 0.12), z0: b.z0 - (o.folga != null ? o.folga : 0.12), z1: b.z1 + (o.folga != null ? o.folga : 0.12), yTop: pz.yT + 0.3 };
    return out;
  }

  /* ---- a PLANTA DO AMBIENTE como vista superior ortográfica das MESMAS malhas (tubos, conexões, peças, registros do BIM) ----
     o plano de corte fica acima das louças (o que está acima não aparece); a arquitetura é a da planta do sistema (paredes cortadas, cinza com contorno)
     e as louças entram em linha fina. Nada é desenhado pelo gerador: só malha do modelo + as linhas da louça real. */
  function cenaPlanta(c, pz, o) {
    o = o || {};
    var cn = cena(c, pz, o), b = o.box, y0 = o.cotaPiso, yc = o.yCorte;
    cn.modo = "planta"; cn.arq = []; cn.louca = [];
    arr(o.paredes).forEach(function (w) { if (arr(w.pts).length >= 3) { var m = prismaMalha(w.pts, y0 - 0.02, yc); cn.arq.push({ pos: m.pos, idx: m.idx }); } });
    arr(o.pilares).forEach(function (w) { if (arr(w.pts).length >= 3) { var m = prismaMalha(w.pts, y0 - 0.02, yc); cn.arq.push({ pos: m.pos, idx: m.idx, pilar: true }); } });
    cn.louca = arr(o.loucas).map(function (sg) { return [sg[0][0], sg[0][1], sg[0][2], sg[1][0], sg[1][1], sg[1][2]].map(r5); });
    cn.arqCor = o.arqCor || "#e4e4e4"; cn.arqContorno = o.arqContorno || "#8c8c8c"; cn.corLouca = o.corLouca || "#9a9a9a";
    /* a projeção: u = x, v = z (z cresce para BAIXO, como a planta da folha), profundidade = y (o mais alto fica por cima) */
    cn.proj = { au: [1, 0, 0], bv: [0, 0, 1], ed: [0, 1, 0], u0: b.x0, u1: b.x1, v0: b.z0, v1: b.z1, d0: y0 - 1, d1: yc + 1 };
    cn.viewer = [0, 1, 0];
    cn.clip = { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, yTop: yc + 0.004 };   /* o plano logo acima do topo das paredes cortadas (sem brigar com a face de cima) */
    return cn;
  }

  /* ---- o render (navegador): THREE + a matriz afim do isométrico ---- */
  function renderizar(THREE, cn, o) {
    o = o || {};
    /* a VISIBILIDADE GRÁFICA da vista salva (js/hidvistaiso.js VIS_PADRAO): arquitetura transparente + aresta, louça em contorno, instalação opaca */
    var vis = o.vis || {}, vArq = vis.arquitetura || {}, vLou = vis.louca || {};
    function hexN(h, d) { var m = /^#?([0-9a-f]{6})$/i.exec(String(h || "")); return m ? parseInt(m[1], 16) : d; }
    if (o.opacArq == null && vArq.opacidade != null) o.opacArq = +vArq.opacidade;
    var pj = cn.proj, W = o.largura || 2800, H = Math.round(W * (pj.v1 - pj.v0) / (pj.u1 - pj.u0));
    var canvas = o.canvas || document.createElement("canvas"); canvas.width = W; canvas.height = H;
    var ren = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    ren.setPixelRatio(1); ren.setSize(W, H, false); ren.setClearColor(0xffffff, 1);
    var sc = new THREE.Scene(), cam = new THREE.Camera();
    var uc = (pj.u0 + pj.u1) / 2, hw = (pj.u1 - pj.u0) / 2, vc = (pj.v0 + pj.v1) / 2, hh = (pj.v1 - pj.v0) / 2, dc = (pj.d0 + pj.d1) / 2, hd = (pj.d1 - pj.d0) / 2;
    /* clip = ( (u−uc)/hw , (vc−v)/hh , −(d−dc)/hd , 1 ) com u,v,d lineares na posição (a MESMA afinidade do isométrico vetorial) */
    cam.projectionMatrix.set(
      pj.au[0] / hw, pj.au[1] / hw, pj.au[2] / hw, -uc / hw,
      -pj.bv[0] / hh, -pj.bv[1] / hh, -pj.bv[2] / hh, vc / hh,
      -pj.ed[0] / hd, -pj.ed[1] / hd, -pj.ed[2] / hd, dc / hd,
      0, 0, 0, 1);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    var pxPorM = W / (pj.u1 - pj.u0), off = (o.contornoPx != null ? o.contornoPx : 1.6) / pxPorM;
    var planos = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -cn.clip.x0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), cn.clip.x1), new THREE.Plane(new THREE.Vector3(0, 0, 1), -cn.clip.z0), new THREE.Plane(new THREE.Vector3(0, 0, -1), cn.clip.z1)];
    var planta = cn.modo === "planta";
    if (planta && cn.clip.yTop != null) planos.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), cn.clip.yTop));   /* o plano de corte da planta: y <= yTop */
    ren.localClippingEnabled = true;
    var v = cn.viewer || [0.577, 0.577, 0.577];
    sc.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 0.55));
    var dl = new THREE.DirectionalLight(0xffffff, 0.75); dl.position.set(v[0] * 10 + 3, v[1] * 10 + 6, v[2] * 10 - 2); sc.add(dl);
    var dl2 = new THREE.DirectionalLight(0xffffff, 0.25); dl2.position.set(-v[0] * 6, 2, -v[2] * 6); sc.add(dl2);
    function geo(m, deslocar) {
      var g = new THREE.BufferGeometry(), pos = new Float32Array(m.pos);
      if (deslocar) for (var i = 0; i < pos.length; i += 3) { pos[i] += m.nrm[i] * deslocar; pos[i + 1] += m.nrm[i + 1] * deslocar; pos[i + 2] += m.nrm[i + 2] * deslocar; }
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); if (m.nrm) g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(m.nrm), 3)); g.setIndex(m.idx); return g;
    }
    var PECA_GRANDE = 0.25;   /* m: acima disso a peça (caixa) leva contorno por aresta, não a casca invertida */
    var pretoMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide, clippingPlanes: planos });
    /* 1) arquitetura: transparente, sem escrever profundidade, com aresta fina cinza */
    cn.arq.forEach(function (m) {
      if (planta) {   /* planta: parede/pilar CORTADOS = cinza do sistema com contorno, opacos, por BAIXO da instalação */
        var gp = new THREE.BufferGeometry(); gp.setAttribute("position", new THREE.BufferAttribute(new Float32Array(m.pos), 3)); gp.setIndex(m.idx);
        var mp = new THREE.Mesh(gp, new THREE.MeshBasicMaterial({ color: hexN(cn.arqCor, 0xe4e4e4), side: THREE.DoubleSide, depthWrite: false, depthTest: false, clippingPlanes: planos })); mp.renderOrder = -2; mp.frustumCulled = false; sc.add(mp);
        var ep = new THREE.LineSegments(new THREE.EdgesGeometry(gp, 25), new THREE.LineBasicMaterial({ color: hexN(cn.arqContorno, 0x8c8c8c), depthWrite: false, depthTest: false, clippingPlanes: planos })); ep.renderOrder = -1; ep.frustumCulled = false; sc.add(ep);
        return;
      }
      var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(m.pos), 3)); g.setIndex(m.idx); g.computeVertexNormals();
      var mat = new THREE.MeshLambertMaterial({ color: m.piso ? 0xc9c9c9 : 0xb4b4b4, transparent: true, opacity: m.piso ? (vArq.piso != null ? +vArq.piso : 0.30) : (o.opacArq != null ? o.opacArq : 0.2), depthWrite: false, side: THREE.DoubleSide, clippingPlanes: planos });
      var me = new THREE.Mesh(g, mat); me.renderOrder = 5; me.frustumCulled = false; sc.add(me);
      var ed = new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: hexN(vArq.aresta, 0x8c8c8c), transparent: true, opacity: 0.85, clippingPlanes: planos })); ed.renderOrder = 6; ed.frustumCulled = false; sc.add(ed);
    });
    /* 2) louças e móveis: as linhas da malha real em meio-tom */
    if (cn.louca.length) {
      var lp = new Float32Array(cn.louca.length * 6); cn.louca.forEach(function (s, i) { for (var k = 0; k < 6; k++) lp[i * 6 + k] = s[k]; });
      var lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
      var ls = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: hexN(planta ? cn.corLouca : vLou.cor, 0x9a9a9a), transparent: true, opacity: planta ? 1 : 0.7, depthTest: !planta, clippingPlanes: planos })); ls.renderOrder = 6; ls.frustumCulled = false; sc.add(ls);
    }
    /* 3) instalação: sólido opaco com a cor do sistema + contorno preto fino (casca invertida) */
    cn.malhas.forEach(function (m) {
      var mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(m.cor), roughness: m.tipo === "registro" ? 0.35 : 0.55, metalness: m.tipo === "registro" ? 0.5 : 0.0, side: THREE.DoubleSide, clippingPlanes: planos });
      var me = new THREE.Mesh(geo(m), mat); me.frustumCulled = false; me.renderOrder = 1; sc.add(me);
      /* R05: peça ABERTA e grande (caixa de inspeção/gordura, ralo) — a casca invertida preta aparecia por dentro (disco preto na planta): contorno por aresta fina */
      var bxM = 0; if (m.tipo === "peca") { var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (var ip = 0; ip < m.pos.length; ip += 3) for (var ax = 0; ax < 3; ax++) { if (m.pos[ip + ax] < mn[ax]) mn[ax] = m.pos[ip + ax]; if (m.pos[ip + ax] > mx[ax]) mx[ax] = m.pos[ip + ax]; } bxM = Math.max(mx[0] - mn[0], mx[2] - mn[2]); }
      if (bxM > PECA_GRANDE) { var ce = new THREE.LineSegments(new THREE.EdgesGeometry(geo(m), 30), new THREE.LineBasicMaterial({ color: 0x333333, clippingPlanes: planos })); ce.frustumCulled = false; ce.renderOrder = 2; sc.add(ce); }
      else { var oc = new THREE.Mesh(geo(m, off), pretoMat); oc.frustumCulled = false; oc.renderOrder = 0; sc.add(oc); }
    });
    ren.render(sc, cam);
    return { canvas: canvas, w: W, h: H, renderer: ren };
  }

  var HidRender3D = { VERSAO: 2, cena: cena, cenaPlanta: cenaPlanta, renderizar: renderizar };
  global.HidRender3D = HidRender3D;
  if (typeof module !== "undefined" && module.exports) module.exports = HidRender3D;
  /* hid:geometria-fim */
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

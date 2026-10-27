/* =====================================================================
 * bimpintar.js — PINTAR E DIVIDIR FACE do modelador (motor PURO, ES5).
 *
 * Plano do BIM, fase P4, frente D (09/10/2026). "Pintar"
 * põe um MATERIAL numa face da peça sem mudar o tipo dela, e
 * "Dividir face" corta a face em regiões que se pintam separadas (o barrado
 * de azulejo até 1,50 m e a pintura daí para cima). Cada
 * região pintada tem a SUA ÁREA — líquida dos vãos de porta e janela, dos
 * encostos de T/X e do que um pilar unido tirou da face — e entra no
 * orçamento como uma linha em m² (js/orcmodelo.js, bloco "P4").
 *
 * AS OPS (extensão do replay do js/bimedit.js — `BimEdit.estender`):
 *   {op:"pintar", id, face, regiao?, material, codigo?}
 *   {op:"removerPintura", id, face, regiao?}         (sem regiao: a face toda)
 *   {op:"dividirFace", id, face, alturas:[h…]}       (barrado; [] desfaz)
 *   face: parede "fora" | "dentro" (a face externa/interna da parede);
 *         laje   "topo" | "fundo".
 *   regiao: 0 = a de baixo; com alturas [1,5] a face tem 0 (até 1,50 m
 *         da base) e 1 (de 1,50 m ao topo). Alturas em metros a partir da
 *         base da parede, crescentes, até 8 cortes.
 * Na peça fica só a FONTE (pinturas: {"fora|0": {material, codigo}},
 * divFaces: {fora: [1.5]}) — mapa de valores simples, sem lista dentro de
 * lista na op. A área se calcula onde os vãos são conhecidos (registro de
 * parâmetros, orçamento, tela): `regioes(c, aceitos)`.
 *
 * REGRAS DA CASA: o material é texto (o nome que vai para o orçamento e para
 * o IFC, Pset OrcaPRO_Pintura); a composição (codigo) é opcional — sem ela a
 * linha sai "sem composição" com os m², nunca some. O preço vem da base
 * vigente (regra 3 do js/orcmodelo.js).
 *
 * Teste: node tools/test-p4-paredes.js (grupo [pintar]) e
 *        tools/e2e-bim-p4.js (pintar a face → m² no orçamento).
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function AV() { return global.BimAcabVis || (typeof require === "function" ? (function () { try { return require("./bimacabvis.js"); } catch (e) { return null; } })() : null); }
  function PC() { return global.BimPintarCat || (typeof require === "function" ? (function () { try { return require("./bimpintarcat.js"); } catch (e) { return null; } })() : null); }
  function A() { return global.BimArq || (typeof require === "function" ? (function () { try { return require("./bimarq.js"); } catch (e) { return null; } })() : null); }

  /* materiais de acabamento da RA (nome + cor do desenho). O usuário pode
     digitar outro nome: o que vale para o orçamento é a composição. */
  var MATERIAIS = [
    { id: "pintura-acrilica", rotulo: "Pintura acrílica", cor: "#e4ddcc" },
    { id: "textura", rotulo: "Textura acrílica", cor: "#cdb994" },
    { id: "azulejo", rotulo: "Revestimento cerâmico (azulejo)", cor: "#9ec3d6" },
    { id: "porcelanato", rotulo: "Porcelanato", cor: "#bdb4a5" },
    { id: "pastilha", rotulo: "Pastilha", cor: "#5f9fb6" },
    { id: "pedra", rotulo: "Pedra (granito, ardósia)", cor: "#7b7873" },
    { id: "reboco", rotulo: "Reboco aparente", cor: "#c2baa9" },
    { id: "verniz", rotulo: "Verniz / stain", cor: "#a26f3d" }
  ];
  /* ACABAMENTO VISUAL (19/10/2026, js/bimacabvis.js): a paleta de fachada e de interior (grafite, off-white, concreto aparente,
     ripado, cimentício, pedra, porcelanato amadeirado, tijolinho, metal preto). Cada um tem NOME fixo, cor sRGB e a textura da
     biblioteca que o Realista veste — o mesmo `pintar`, sem um segundo jeito de pôr material na parede. */
  (function () {
    var V = AV(); if (!V) return;
    V.CATALOGO.forEach(function (e) { if (e.grupo === "fachada" || e.grupo === "metal") MATERIAIS.push({ id: e.id, rotulo: e.rotulo, cor: e.cor }); });
  })();
  /* PILAR (27/10/2026): 4 faces nomeadas pelo giro (rotY) do próprio pilar — frente = o lado +w do pilar, direita = +u; o pilar de AÇO tem
     acabamento próprio (js/metalacab.js) e não entra. PLATIBANDA (a do telhado, js/bimcobertura.js): face externa e interna, sem faixas. */
  var FACES = { parede: ["fora", "dentro"], laje: ["topo", "fundo"], pilar: ["frente", "fundo-pilar", "direita", "esquerda"], platibanda: ["fora", "dentro"] };
  var ROTULO_FACE = { fora: "Face externa", dentro: "Face interna", topo: "Face superior", fundo: "Face inferior", frente: "Face da frente", "fundo-pilar": "Face de trás", direita: "Face da direita", esquerda: "Face da esquerda" };
  function tipoDe(c) { return c && (c.tipo || (c.telhado != null && !c.contorno && !c.tipoBorda ? "platibanda" : null)); }
  function existente(c) { return String(c && c.faseCriada == null ? "" : c.faseCriada).trim().toLowerCase() === "existente"; }
  var OPS = ["pintar", "removerPintura", "dividirFace"];
  var MAX_CORTES = 8;

  function corDe(material) {
    var s = txt(material).toLowerCase(), V = AV(), ac = V ? V.porNome(material) : null;
    if (ac) return ac.cor;
    for (var i = 0; i < MATERIAIS.length; i++) if (MATERIAIS[i].rotulo.toLowerCase() === s || MATERIAIS[i].id === s) return MATERIAIS[i].cor;
    var h = 0; for (var k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) % 360;   /* outro nome: uma cor estável pelo nome */
    return "hsl(" + h + ", 35%, 70%)";
  }
  function faceOk(c, face) { var t = tipoDe(c); return !!c && !!FACES[t] && FACES[t].indexOf(face) >= 0 && !(t === "pilar" && c.material === "aco"); }
  function alturasOk(l) {
    if (!Array.isArray(l) || l.length > MAX_CORTES) return false;
    for (var i = 0; i < l.length; i++) { if (!fin(l[i]) || l[i] <= 0 || l[i] > 30) return false; if (i && !(l[i] > l[i - 1] + 1e-6)) return false; }
    return true;
  }

  /* ---------------------------------------------------------- forma da op */
  function validaOp(o) {
    if (!o || OPS.indexOf(o.op) < 0) return undefined;
    var idOk = (typeof o.id === "string" && o.id.length > 0) || fin(o.id);
    var faceOk2 = typeof o.face === "string" && ROTULO_FACE.hasOwnProperty(o.face);
    var regOk = o.regiao == null || (fin(o.regiao) && o.regiao >= 0 && o.regiao <= MAX_CORTES && o.regiao === Math.floor(o.regiao));
    if (!idOk || !faceOk2 || !regOk) return false;
    if (o.op === "pintar") return typeof o.material === "string" && o.material.trim().length > 0 && o.material.length <= 80 && (o.codigo == null || ((typeof o.codigo === "string" || fin(o.codigo)) && String(o.codigo).length <= 24));
    if (o.op === "dividirFace") return alturasOk(o.alturas);
    return true;
  }

  /* ------------------------------------------------------------- replay */
  function aplicarOp(o, ctx) {
    if (!o || OPS.indexOf(o.op) < 0 || validaOp(o) !== true) return false;
    var c = ctx && ctx.caixas && ctx.caixas[o.id];
    var plat = !c && ctx && ctx.cob && ctx.cob.plat && ctx.cob.plat[o.id];
    if (plat) return aplicarPlat(o, plat);
    if (!faceOk(c, o.face)) return false;
    var reg = o.regiao == null ? 0 : o.regiao, k = o.face + "|" + reg;
    if (o.op === "pintar") {
      var nCortes = arr(c.divFaces && c.divFaces[o.face]).length;
      if (reg > nCortes) return false;   /* a região não existe (divida a face antes) */
      var p = { material: o.material.trim() };
      if (o.codigo != null && String(o.codigo).trim()) p.codigo = String(o.codigo).trim();
      (c.pinturas = c.pinturas || {})[k] = p;
      return true;
    }
    if (o.op === "removerPintura") {
      if (!c.pinturas) return false;
      var antes = Object.keys(c.pinturas).length;
      Object.keys(c.pinturas).forEach(function (q) { if (o.regiao == null ? q.split("|")[0] === o.face : q === k) delete c.pinturas[q]; });
      if (!Object.keys(c.pinturas).length) delete c.pinturas;
      return antes !== (c.pinturas ? Object.keys(c.pinturas).length : 0);
    }
    /* dividirFace: só parede (a laje não tem barrado) */
    if (c.tipo !== "parede") return false;
    var dv = c.divFaces || {};
    if (!o.alturas.length) delete dv[o.face]; else dv[o.face] = o.alturas.slice();
    if (Object.keys(dv).length) c.divFaces = dv; else delete c.divFaces;
    /* a pintura de uma região que deixou de existir sai junto */
    if (c.pinturas) {
      Object.keys(c.pinturas).forEach(function (q) { var pr = q.split("|"); if (pr[0] === o.face && Number(pr[1]) > o.alturas.length) delete c.pinturas[q]; });
      if (!Object.keys(c.pinturas).length) delete c.pinturas;
    }
    return true;
  }
  /* a platibanda do telhado (ctx.cob.plat[id], js/bimcobertura.js): só a face inteira (regiao 0); a pintura fica na própria fonte da platibanda */
  function aplicarPlat(o, p) {
    if (FACES.platibanda.indexOf(o.face) < 0 || (o.regiao != null && o.regiao !== 0) || o.op === "dividirFace") return false;
    var k = o.face + "|0";
    if (o.op === "pintar") {
      var q = { material: o.material.trim() };
      if (o.codigo != null && String(o.codigo).trim()) q.codigo = String(o.codigo).trim();
      (p.pinturas = p.pinturas || {})[k] = q; return true;
    }
    if (!p.pinturas || !p.pinturas[k]) return false;
    delete p.pinturas[k]; if (!Object.keys(p.pinturas).length) delete p.pinturas; return true;
  }
  function registrar(BE) {
    if (!BE || typeof BE.estender !== "function") return false;
    BE.estender({ nome: "pintar", aplicar: aplicarOp, valida: validaOp });
    return true;
  }

  /* ------------------------------------------------------ as áreas */
  /* a faixa de alturas da região k de uma face de parede: [ya, yb] ABSOLUTAS */
  function faixa(c, face, k) {
    var base = num(c.cy, 0) - num(c.altura, 0) / 2, cortes = arr(c.divFaces && c.divFaces[face]);
    return [k === 0 ? -1e9 : base + cortes[k - 1], k >= cortes.length ? 1e9 : base + cortes[k]];
  }
  /* a área da face da parede entre as cotas ya e yb (absolutas), LÍQUIDA:
     − vãos (aceitos do BimEdit.vaosNaParede, no local da parede),
     − encostos de T/X (o trecho coberto pela outra parede),
     − o que uma peça UNIDA (pilar, viga) tirou da face (P4-B, cortesFace) */
  function areaFaixaParede(c, face, ya, yb, aceitos) {
    var Ar = A(); if (!Ar) return 0;
    var f = Ar.frameDe(c), t = f.t, inv = !!c.inverterFaces, s = (face === "dentro") !== inv ? 1 : -1, w = s * t / 2, un = c.uniao || {};
    function uEm(l, ww) { return l.c0 + l.c1 * ww; }
    var FA = un.faceIni || un.ini || { c0: -f.L / 2, c1: 0 }, FB = un.faceFim || un.fim || { c0: f.L / 2, c1: 0 };
    var uIni = uEm(FA, w), uFim = uEm(FB, w);
    var gaps = arr(un.cruz).map(function (g) { return [uEm(g.a, w), uEm(g.b, w)]; }).sort(function (a, b) { return a[0] - b[0]; });
    var trechos = [], cur = uIni;
    gaps.forEach(function (g) { if (g[0] > cur) trechos.push([cur, Math.min(g[0], uFim)]); cur = Math.max(cur, g[1]); });
    if (uFim > cur) trechos.push([cur, uFim]);
    var lo = Math.max(f.y0, ya), tot = 0;
    trechos.forEach(function (tr) { if (tr[1] - tr[0] > 1e-9) tot += Ar._integrarFace(c, tr[0], tr[1], yb, lo); });
    arr(un.abut).forEach(function (ab) {
      if ((ab.lado > 0 ? 1 : -1) !== s) return;
      tot -= Ar._integrarFace(c, ab.u0, ab.u1, Math.min(num(ab.topo, 1e9), yb), Math.max(f.y0, num(ab.base, f.y0), ya));
    });
    arr(c.cortesFace).forEach(function (ct) {
      arr(ct.trechos).forEach(function (q) { if (q.face !== face) return; tot -= Ar._integrarFace(c, q.u0, q.u1, Math.min(q.topo, yb), Math.max(q.base, lo)); });
    });
    arr(aceitos).forEach(function (v) {
      var v0 = f.y0 + num(v.y0, 0), v1 = f.y0 + num(v.y1, 0), h = Math.min(v1, yb) - Math.max(v0, ya);
      if (h > 0) tot -= (num(v.x1, 0) - num(v.x0, 0)) * h;
    });
    return Math.max(0, tot);
  }
  /* todas as regiões pintadas de uma peça: [{ face, regiao, rotuloFace,
     material, codigo, cor, area, ya, yb }] — `aceitos` = vãos da parede */
  /* PILAR: a área exposta de uma face = largura da face x altura - o que a parede unida cobre (o cortesFace da parede, com = id do pilar).
     A face que a parede toca é a de maior alinhamento com a direção pilar -> parede; sem dado nenhum de encosto, vale a LATERAL INTEIRA e a
     região diz isso (premissa visível no orçamento). */
  function normalPilar(c, face) {
    var f = A().frameDe(c);
    return { frente: [f.si, f.co], "fundo-pilar": [-f.si, -f.co], direita: [f.co, -f.si], esquerda: [-f.co, f.si] }[face];
  }
  function areaPilar(c, face, estado) {
    var f = A().frameDe(c), larg = (face === "frente" || face === "fundo-pilar") ? f.L : f.t, bruta = larg * f.H, desc = 0, achou = false;
    arr(estado && estado.caixas).forEach(function (w) {
      if (!w || w.tipo !== "parede") return;
      arr(w.cortesFace).forEach(function (ct) {
        if (String(ct.com) !== String(c.id)) return;
        achou = true;
        var d = [num(w.cx, 0) - num(c.cx, 0), num(w.cz, 0) - num(c.cz, 0)], melhor = null, mv = -Infinity;
        ["frente", "fundo-pilar", "direita", "esquerda"].forEach(function (k) { var n = normalPilar(c, k), v = n[0] * d[0] + n[1] * d[1]; if (v > mv) { mv = v; melhor = k; } });
        if (melhor === face) desc += Math.max(num(ct.fora, 0), num(ct.dentro, 0));
      });
    });
    return { area: Math.max(0, bruta - desc), bruta: bruta,
             premissa: achou ? "área da lateral descontando o encosto das paredes unidas (cortes de face da parede)" : "lateral inteira: sem dado de encosto em parede (premissa — confira se há parede encostada)" };
  }
  function regioes(c, aceitos, estado) {
    if (!c || !c.pinturas) return [];
    var out = [];
    Object.keys(c.pinturas).sort().forEach(function (k) {
      var pr = k.split("|"), face = pr[0], reg = Number(pr[1]) || 0, p = c.pinturas[k];
      if (!faceOk(c, face)) return;
      var area = 0, ya = null, yb = null, premissa = "";
      if (tipoDe(c) === "pilar") { var ap = areaPilar(c, face, estado); area = ap.area; premissa = ap.premissa; }
      else if (tipoDe(c) === "platibanda") { area = num(c.area, 0); }   /* a área de UMA face = comprimento x altura */
      else if (c.tipo === "parede") { var fx = faixa(c, face, reg); ya = fx[0]; yb = fx[1]; area = areaFaixaParede(c, face, fx[0], fx[1], aceitos); }
      else {
        var X = c._exato; area = X && fin(X.area) ? X.area : num(c.area, 0);
      }
      var cortes = arr(c.divFaces && c.divFaces[face]).length;
      out.push({ face: face, regiao: reg, rotuloFace: ROTULO_FACE[face] + (cortes ? " (faixa " + (reg + 1) + " de " + (cortes + 1) + ")" : ""),
                 material: txt(p.material), codigo: p.codigo ? txt(p.codigo) : "", cor: corDe(p.material), area: area, premissa: premissa,
                 ya: ya != null && ya > -1e8 ? r6(ya) : null, yb: yb != null && yb < 1e8 ? r6(yb) : null });
    });
    return out;
  }
  /* o que vai para o orçamento: uma linha por região pintada (m²) */
  function servicosOrc(estado, vaos) {
    var out = [];
    var CAT = PC();   /* 27/10/2026 (js/bimpintarcat.js): o material do catálogo novo diz se é pintura ou revestimento e se está "a orçar" (sem composição) */
    function rotuloPeca(c) { return c.tipo === "laje" ? "laje" : (c.tipo === "pilar" ? "pilar" : "parede"); }
    /* a platibanda do telhado pintada: uma linha por face; a fase "Existente" não orça construção (nem a pintura dela) */
    arr(estado && estado.platibandas).forEach(function (p) {
      if (!p || !p.ok || !p.pinturas || existente(p)) return;
      regioes(p, null, estado).forEach(function (r) {
        var sv = CAT && CAT.servicoDe ? CAT.servicoDe(r.material) : null;
        out.push({ servicoTipo: sv ? sv.servico : "", aOrcar: !!(sv && sv.aOrcar && !r.codigo), id: p.id + ":pintura:" + r.face + ":0", peca: p.id, face: r.face, regiao: 0, codigo: r.codigo, material: r.material, unidade: "m2",
                   quantidade: r4(r.area), exato: r.area, premissa: "", rotulo: r.material + " — " + r.rotuloFace.toLowerCase() + " (platibanda " + p.id + ")" });
      });
    });
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || !c.pinturas) return;
      var ac = vaos && vaos[c.id] ? vaos[c.id].aceitos : null;
      regioes(c, ac, estado).forEach(function (r) {
        var sv = CAT && CAT.servicoDe ? CAT.servicoDe(r.material) : null;
        out.push({ servicoTipo: sv ? sv.servico : "", aOrcar: !!(sv && sv.aOrcar && !r.codigo), id: c.id + ":pintura:" + r.face + ":" + r.regiao, peca: c.id, face: r.face, regiao: r.regiao, codigo: r.codigo, material: r.material, unidade: "m2",
                   quantidade: r4(r.area), exato: r.area, premissa: r.premissa || "", rotulo: r.material + " — " + r.rotuloFace.toLowerCase() + " (" + rotuloPeca(c) + " " + c.id + ")" });
      });
    });
    return out;
  }
  /* a face clicada: o ponto do 3D (x, y, z) → { face, regiao } da peça */
  function faceDoPonto(c, p) {
    var Ar = A(); if (!c || !p || !Ar) return null;
    if (tipoDe(c) === "pilar") {
      if (c.material === "aco") return null;
      var fp = Ar.frameDe(c), lp = Ar.aLocal(fp, num(p.x, 0), num(p.z, 0)), ru = lp[0] / Math.max(fp.L / 2, 1e-6), rw = lp[1] / Math.max(fp.t / 2, 1e-6);
      return { face: Math.abs(rw) >= Math.abs(ru) ? (rw > 0 ? "frente" : "fundo-pilar") : (ru > 0 ? "direita" : "esquerda"), regiao: 0 };
    }
    if (tipoDe(c) === "platibanda") {
      var best = null, bd = Infinity;
      arr(c.segs).forEach(function (s) {
        var qq = s.quad; if (!qq) return;
        var mx = qq[0].x - qq[3].x, mz = qq[0].z - qq[3].z, ml = Math.sqrt(mx * mx + mz * mz) || 1, hx = mx / ml * ml / 2, hz = mz / ml * ml / 2;   /* a LINHA DO MEIO da espessura: o trecho mais perto dela */
        var ax = s.a.x - hx, az = s.a.z - hz, bx = s.b.x - hx, bz = s.b.z - hz, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
        var t = Math.max(0, Math.min(1, ((num(p.x, 0) - ax) * dx + (num(p.z, 0) - az) * dz) / L2)), ex = ax + t * dx - num(p.x, 0), ez = az + t * dz - num(p.z, 0), d = ex * ex + ez * ez;
        if (d < bd) { bd = d; best = s; }
      });
      if (!best || !best.quad) return null;
      var q = best.quad, nx = q[0].x - q[3].x, nz = q[0].z - q[3].z, ln = Math.sqrt(nx * nx + nz * nz) || 1; nx /= ln; nz /= ln;
      var dot = (num(p.x, 0) - best.a.x) * nx + (num(p.z, 0) - best.a.z) * nz;
      return { face: dot > -num(c.espessuraEf, 0.15) / 2 ? "dentro" : "fora", regiao: 0 };
    }
    if (c.tipo === "laje") return { face: num(p.y, 0) >= num(c.cy, 0) ? "topo" : "fundo", regiao: 0 };
    if (c.tipo !== "parede") return null;
    var f = Ar.frameDe(c), l = Ar.aLocal(f, num(p.x, 0), num(p.z, 0)), s = l[1] < 0 ? -1 : 1;
    var face = (s > 0) !== !!c.inverterFaces ? "dentro" : "fora";
    var cortes = arr(c.divFaces && c.divFaces[face]), h = num(p.y, 0) - f.y0, reg = 0;
    while (reg < cortes.length && h > cortes[reg]) reg++;
    return { face: face, regiao: reg, h: h };
  }
  /* o desenho da região na face: polígonos no plano local (u, y) + o w da
     face (o 3D desloca 3 mm para fora) e os vãos como furos */
  function desenhoRegiao(c, face, reg, aceitos) {
    var Ar = A(); if (!Ar || !c) return null;
    if (tipoDe(c) === "pilar") {   /* a face do pilar como uma parede de 1 face: o mesmo desenho (frame + w) do 3D */
      var fq = Ar.frameDe(c), ang = { frente: 0, "fundo-pilar": Math.PI, direita: Math.PI / 2, esquerda: -Math.PI / 2 }[face], lado = (face === "frente" || face === "fundo-pilar");
      var ps = { id: c.id, tipo: "parede", cx: c.cx, cz: c.cz, cy: c.cy, altura: c.altura, rotY: num(c.rotY, 0) + ang, comprimento: lado ? fq.L : fq.t, espessura: lado ? fq.t : fq.L };
      return desenhoRegiao(ps, "dentro", 0, null);
    }
    if (tipoDe(c) === "platibanda") return null;   /* a platibanda tem o seu desenho (quadsPlatibanda) */
    var f = Ar.frameDe(c);
    if (c.tipo === "laje") return { laje: true, y: face === "topo" ? f.y1 + 0.003 : f.y0 - 0.003 };
    var fx = faixa(c, face, reg), inv = !!c.inverterFaces, s = (face === "dentro") !== inv ? 1 : -1, w = s * (f.t / 2 + 0.003), un = c.uniao || {};
    function uEm(l, ww) { return l.c0 + l.c1 * ww; }
    var FA = un.faceIni || un.ini || { c0: -f.L / 2, c1: 0 }, FB = un.faceFim || un.fim || { c0: f.L / 2, c1: 0 };
    var u0 = uEm(FA, s * f.t / 2), u1 = uEm(FB, s * f.t / 2), ylo = Math.max(f.y0, fx[0]);
    var qs = [u0, u1];
    arr(c.topo).forEach(function (sg) { [sg.u0, sg.u1].forEach(function (u) { if (u > u0 && u < u1) qs.push(u); }); });
    qs.sort(function (a, b) { return a - b; });
    var topo = qs.map(function (u) { return [u, Math.max(ylo, Math.min(Ar.topoEm(c, u), fx[1]))]; });
    var poli = [[u0, ylo], [u1, ylo]].concat(topo.slice().reverse());
    var furos = arr(aceitos).map(function (v) {
      var a = Math.max(f.y0 + num(v.y0, 0), ylo), b = Math.min(f.y0 + num(v.y1, 0), fx[1]);
      return b - a > 1e-6 ? [[num(v.x0, 0), a], [num(v.x1, 0), a], [num(v.x1, 0), b], [num(v.x0, 0), b]] : null;
    }).filter(Boolean);
    return { w: w, poli: poli, furos: furos, frame: f };
  }

  /* a película de uma face da platibanda: um quadrilátero 3D por trecho, 3 mm para fora da face */
  function quadsPlatibanda(p, face) {
    var out = [];
    arr(p && p.segs).forEach(function (s) {
      var q = s.quad; if (!q || q.length < 4) return;
      var nx = q[0].x - q[3].x, nz = q[0].z - q[3].z, ln = Math.sqrt(nx * nx + nz * nz) || 1; nx /= ln; nz /= ln;
      var e = 0.003, A0 = face === "dentro" ? q[0] : q[3], B0 = face === "dentro" ? q[1] : q[2], k = face === "dentro" ? e : -e;
      out.push([[A0.x + nx * k, p.base, A0.z + nz * k], [B0.x + nx * k, p.base, B0.z + nz * k], [B0.x + nx * k, p.topo, B0.z + nz * k], [A0.x + nx * k, p.topo, A0.z + nz * k]]);
    });
    return out;
  }
  var BimPintar = {
    quadsPlatibanda: quadsPlatibanda, areaPilar: areaPilar, normalPilar: normalPilar, tipoDe: tipoDe,
    MATERIAIS: MATERIAIS, FACES: FACES, ROTULO_FACE: ROTULO_FACE, OPS: OPS, MAX_CORTES: MAX_CORTES,
    corDe: corDe, validaOp: validaOp, aplicarOp: aplicarOp, registrar: registrar,
    faixa: faixa, areaFaixaParede: areaFaixaParede, regioes: regioes, servicosOrc: servicosOrc, faceDoPonto: faceDoPonto, desenhoRegiao: desenhoRegiao
  };
  if (global.BimEdit) registrar(global.BimEdit);
  global.BimPintar = BimPintar;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPintar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

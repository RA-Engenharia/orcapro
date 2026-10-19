/* =====================================================================
 * biminstgeo.js (HidGeo) — GEOMETRIA PARAMÉTRICA de tubos, conexões, caixas, ralos e
 * registros (motor puro, Node-testável; sem three.js).
 *
 * Pedido do Rogério (17/10/2026): "tem que ficar igual ao projeto de
 * hidrossanitário — famílias idênticas à modelagem real". As conexões eram
 * bolotas, os tubos cilindros lisos sem bolsa e as pontas soltas esferas
 * vermelhas. Aqui cada peça sai com a forma de verdade e as COTAS da norma
 * ou da ficha técnica (js/biminstgeodados.js, gerado de dados-fonte/hidro/).
 *
 * ⚠ ORIGEM DE CADA COTA (vai junto na saída, campo `origem`):
 *   "norma"     — tabela de norma transcrita (NBR 5648/5688/7362/5590/13206);
 *   "catalogo"  — ficha técnica com cotas (regra de leitura no gerador);
 *   "proporcao" — NEM norma NEM catálogo trazem a cota: PROP abaixo, cada
 *                 uma declarada e ajustada às peças que TÊM cota. A saída
 *                 leva aConferir:true. Nunca se pega a cota "parecida" de
 *                 outro DN ou de outro material.
 *   Leitura de desenho que não fecha por conta (ex.: perna do joelho de
 *   esgoto) também sai com aConferir:true (`interpretacao` no gerador).
 *
 * SAÍDA: malhas em coordenadas do MUNDO (metros, Y para cima, a convenção do
 *   viewer), como listas puras { pos:[x,y,z…], nrm:[…], idx:[…], cascas:[[i0,i1]…] }.
 *   Cada casca é um sólido FECHADO (o teste solda as posições e confere que toda
 *   aresta tem exatamente dois triângulos). A tela (js/biminstui.js) só copia
 *   as listas para um BufferGeometry. `partes` separa o que tem acabamento
 *   diferente (corpo de PVC × bucha de latão × canopla cromada × grelha).
 *
 * API para as outras frentes (traçado, louças): tubo(), no(), conexao(),
 *   peca(), registro(), aparencia(), cotasTubo(), cotasConexao(), eixosDoNo().
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function dados() { return dep("HidGeoDados", "./biminstgeodados.js") || { tubos: {}, conexoes: {}, pecas: {}, fontes: {} }; }
  /* a MEDIDA DO PRODUTO (rodada 4 da paridade, 18/10/2026): as conexões de esgoto série normal com as cotas da tabela de
     dimensões da peça de verdade, conferidas contra a ficha (dados-fonte/hidro/geometria/produto-esgoto-serie-normal.json) */
  function produto() { return dep("HidProdutoDados", "./biminstprodutodados.js") || { joelho: {}, linha: {} }; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  var MM = 0.001;

  /* ------------------------------------------------------------ vetores */
  function V(x, y, z) { return [x, y, z]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function nrmz(a) { var l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }
  function pv(p) { return Array.isArray(p) ? p : [num(p.x, 0), num(p.y, 0), num(p.z, 0)]; }
  /* um vetor perpendicular a d, sempre o mesmo para o mesmo d (o anel não "gira" de uma peça para a outra) */
  function perp(d) { var ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; return nrmz(cross(ref, d)); }

  /* ========================================================= MALHA */
  function Malha() { this.pos = []; this.nrm = []; this.idx = []; this.cascas = []; }
  Malha.prototype.v = function (p, n) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); return this.pos.length / 3 - 1; };
  Malha.prototype.t = function (a, b, c) { this.idx.push(a, b, c); };
  Malha.prototype.abrir = function () { this._i0 = this.idx.length; };
  Malha.prototype.fechar = function () { if (this.idx.length > this._i0) this.cascas.push([this._i0, this.idx.length]); };
  Malha.prototype.tri = function () { return this.idx.length / 3; };

  /* ----------------------------------------------------------- caminhos
   * em(s) → { p, t, u, v } com u × v = t (o anel do perfil vive no plano u,v).
   * estacoes: onde o caminho dobra (o perfil é subdividido ali). */
  function reta(a, d) {
    var u = perp(d), v = cross(d, u);
    return { estacoes: [], em: function (s) { return { p: add(a, mul(d, s)), t: d, u: u, v: v }; } };
  }
  /* cotovelo: chega na face 1 (C + d1·z1), dobra com raio Rb em torno do vértice C e sai pela face 2 (C + d2·z2).
     d1, d2 = direções que SAEM do vértice. Devolve também o comprimento total. */
  function cotovelo(C, d1, d2, z1, z2, Rb, passoAng) {
    var ent = mul(d1, -1), cosd = Math.max(-1, Math.min(1, dot(ent, d2))), del = Math.acos(cosd);
    if (del < 1e-4) { var r0 = reta(add(C, mul(d1, z1)), ent); r0.L = z1 + z2; return r0; }
    var np = nrmz(cross(ent, d2));
    if (len(np) < 0.5) np = perp(d1);
    var tl = Rb * Math.tan(del / 2), lim = 0.92 * Math.min(z1, z2);
    if (tl > lim) { tl = lim; Rb = tl / Math.tan(del / 2); }
    var l1 = z1 - tl, la = Rb * del, l2 = z2 - tl, F1 = add(C, mul(d1, z1)), T1 = add(C, mul(d1, tl));
    var bis = nrmz(add(d1, d2)), O = add(C, mul(bis, Rb / Math.cos(del / 2))), a0 = sub(T1, O);
    var est = [], n = Math.max(2, Math.ceil(del / (passoAng || Math.PI / 12)));
    for (var k = 0; k <= n; k++) est.push(l1 + la * k / n);
    function rot(vv, ang) {   /* Rodrigues em torno de np */
      var c = Math.cos(ang), s = Math.sin(ang);
      return add(add(mul(vv, c), mul(cross(np, vv), s)), mul(np, dot(np, vv) * (1 - c)));
    }
    return { L: l1 + la + l2, Rb: Rb, estacoes: est, em: function (s) {
      var p, t;
      if (s <= l1) { p = add(F1, mul(ent, s)); t = ent; }
      else if (s >= l1 + la) { p = add(add(C, mul(d2, tl)), mul(d2, s - l1 - la)); t = d2; }
      else { var ang = (s - l1) / Rb, r = rot(a0, ang); p = add(O, r); t = nrmz(cross(np, r)); }
      return { p: p, t: t, u: np, v: cross(t, np) };
    } };
  }

  /* --------------------------------------------------------- varredura
   * O perfil é uma lista de pontos [s, r] percorrida SEMPRE no mesmo sentido
   * (do eixo, subindo, ao longo, descendo de volta ao eixo — ou um laço fechado
   * para o tubo oco): com essa regra a normal de cada faixa é (−dr, ds) e os
   * triângulos saem com a face para FORA. Cada segmento do perfil é uma faixa
   * com normais próprias (aresta viva entre faixas, suave na volta). */
  function varrer(m, cam, perfil, segs, fechado) {
    var n = perfil.length, lim = fechado ? n : n - 1;
    m.abrir();
    for (var k = 0; k < lim; k++) {
      var a = perfil[k], b = perfil[(k + 1) % n];
      var ds = b[0] - a[0], dr = b[1] - a[1], L = Math.sqrt(ds * ds + dr * dr); if (L < 1e-9) continue;
      var ns = -dr / L, nr = ds / L;
      var ss = [a[0]];
      cam.estacoes.forEach(function (e) { if ((e - a[0]) * (e - b[0]) < -1e-12) ss.push(e); });
      ss.push(b[0]);
      if (ss.length > 2) { var asc = b[0] > a[0]; ss = [a[0]].concat(ss.slice(1, -1).sort(function (x, y) { return asc ? x - y : y - x; })).concat([b[0]]); }
      var aneis = ss.map(function (s, i) {
        var f = ss.length === 2 ? i : (Math.abs(ds) > 1e-12 ? (s - a[0]) / ds : i / (ss.length - 1));
        var r = a[1] + dr * f, fr = cam.em(s), o = cam.desloc ? cam.desloc(s) : null, P = o ? add(fr.p, o) : fr.p;
        if (r < 1e-9) return { c: m.v(P, add(mul(fr.t, ns), [0, 0, 0])) };
        var ids = [];
        for (var j = 0; j < segs; j++) {
          var th = 2 * Math.PI * j / segs, rad = add(mul(fr.u, Math.cos(th)), mul(fr.v, Math.sin(th)));
          ids.push(m.v(add(P, mul(rad, r)), add(mul(fr.t, ns), mul(rad, nr))));
        }
        return { a: ids };
      });
      for (var q = 0; q < aneis.length - 1; q++) {
        var A = aneis[q], B = aneis[q + 1];
        for (var j2 = 0; j2 < segs; j2++) {
          var j3 = (j2 + 1) % segs;
          if (A.a && B.a) { m.t(A.a[j2], A.a[j3], B.a[j2]); m.t(A.a[j3], B.a[j3], B.a[j2]); }
          else if (B.a) m.t(A.c, B.a[j3], B.a[j2]);
          else if (A.a) m.t(A.a[j2], A.a[j3], B.c);
        }
      }
    }
    m.fechar();
  }

  /* toro fechado (volante do registro, marcador discreto): centro, eixo, raio maior R, raio do tubo r */
  function toro(m, C, eixo, R, r, sR, sr) {
    var u = perp(eixo), w = cross(eixo, u), ids = [];
    m.abrir();
    for (var i = 0; i < sR; i++) {
      var a = 2 * Math.PI * i / sR, dirR = add(mul(u, Math.cos(a)), mul(w, Math.sin(a))), cen = add(C, mul(dirR, R)), linha = [];
      for (var j = 0; j < sr; j++) { var b = 2 * Math.PI * j / sr, nn = add(mul(dirR, Math.cos(b)), mul(eixo, Math.sin(b))); linha.push(m.v(add(cen, mul(nn, r)), nn)); }
      ids.push(linha);
    }
    for (var i2 = 0; i2 < sR; i2++) for (var j2 = 0; j2 < sr; j2++) {
      var A = ids[i2], B = ids[(i2 + 1) % sR], j3 = (j2 + 1) % sr;
      m.t(A[j2], B[j2], A[j3]); m.t(A[j3], B[j2], B[j3]);
    }
    m.fechar();
  }

  /* =============================================== FAMÍLIAS DE MATERIAL
   * junta: como o tubo entra na peça — muda o desenho da bolsa.
   *   soldavel: bolsa lisa com um friso na boca (PVC soldável, CPVC);
   *   anel:     bolsa alargada com o alojamento do anel (esgoto, pluvial, ocre);
   *   termo:    bolsa de termofusão com colarinho (PPR, PEAD);
   *   capilar:  bolsa fina de soldar (cobre);
   *   rosca:    conexão de ferro maleável com reforço (aço);
   *   eletro:   curva longa de eletroduto. */
  var JUNTA = { pvc_soldavel: "soldavel", cpvc: "soldavel", pvc_esgoto: "anel", pvc_serie_r: "anel", pvc_esgoto_enterrado: "anel", ppr: "termo", pead: "termo",
                cobre: "capilar", cobre_frigorigeno: "capilar", aco_galvanizado: "rosca", aco_preto: "rosca", aco_carbono: "rosca", inox: "rosca",
                elet_roscavel: "eletro", elet_soldavel: "eletro", elet_corrugado: "eletro", elet_corrugado_ref: "eletro" };

  /* ⚠ PROPORÇÕES DECLARADAS — só quando norma e catálogo não trazem a cota.
     Ajustadas às peças de PVC soldável que TÊM cota (DN 20 e DN 110 da ficha):
       bolsa  pb = 0,5·de + 6        (20 → 16 × norma 16; 110 → 61 × norma 61)
       externo   = 1,22·de + 3        (20 → 27,4 × 28; 110 → 137 × 136)
       joelho 90 z = pb + 0,45·de + 2 (20 → 27 × 27,5; 110 → 112,5 × 116)
       joelho 45 z = pb + 0,2·de + 2  (20 → 22 × 22,3; 110 → 85 × 85,5)
     Bolsa de anel (esgoto) sem cota: externo = 1,13·de + 4 (40 → 49 × 45; 100 → 119 × 116,3).
     Toda cota daqui sai com aConferir: true. */
  var PROP = {
    pb: function (de) { return 0.5 * de + 6; },
    od: function (de, junta) { return junta === "anel" ? 1.13 * de + 4 : (junta === "capilar" ? 1.06 * de + 2.4 : (junta === "rosca" ? 1.28 * de + 6 : 1.22 * de + 3)); },
    z90: function (de, pb) { return pb + 0.45 * de + 2; },
    z45: function (de, pb) { return pb + 0.2 * de + 2; },
    e: function (de) { return Math.max(0.6, 0.06 * de); },
    raioCurvaEletro: function (de) { return 3 * de; }   /* curva longa de eletroduto (3·DE) */
  };

  /* ---------------------------------------------------------- COTAS */
  /* a fonte por extenso de um código do gerador ("n5648" → "ABNT NBR 5648:2018 — Tabela 2…") */
  function fonte(cod, pag) { var F = dados().fontes || {}; return (F[cod] || cod || "") + (pag ? ", pág. " + pag : ""); }

  /* o tubo: { de, e, pb, barra (m), origem {de, e, pb}, aConferir, fontes } (mm) */
  function cotasTubo(material, dn, classe) {
    var T = (dados().tubos || {})[material], d = T && T.dns ? T.dns[String(dn)] : null, junta = JUNTA[material] || "soldavel";
    var o = { material: material, dn: num(dn, 0), junta: junta, barra: T ? T.barra_m : null, origem: {}, fontes: [], aConferir: false };
    if (d && d.de) { o.de = d.de; o.origem.de = "norma"; o.fontes.push(fonte(d.f)); }
    else { o.de = num(dn, 20); o.origem.de = "proporcao"; o.aConferir = true; }   /* PPR, CPVC, PEAD, eletroduto e cobre frigorígeno: a série é designada pelo DE */
    var eCl = d && d.classes && classe && d.classes[classe] != null ? d.classes[classe] : null;
    if (eCl != null) { o.e = eCl; o.origem.e = "norma"; }
    else if (d && d.e) { o.e = d.e; o.origem.e = "norma"; }
    else { o.e = PROP.e(o.de); o.origem.e = "proporcao"; o.aConferir = true; }
    if (d && d.pb) { o.pb = d.pb; o.origem.pb = d.fpb && d.fpb !== d.f ? "catalogo" : "norma"; if (d.fpb && d.fpb !== d.f) o.fontes.push(fonte(d.fpb)); o.pbMin = d.pbMin || null; }
    else { o.pb = PROP.pb(o.de); o.origem.pb = "proporcao"; o.aConferir = true; }
    return o;
  }

  /* a conexão: devolve as cotas que a geometria usa (mm) e de onde vieram */
  function cotasConexao(material, tipo, dn, dn2, dnRamal) {
    var tb = cotasTubo(material, dn), junta = tb.junta, C = ((dados().conexoes || {})[material]) || {};
    var k = dn2 ? dn + "x" + dn2 : String(dn), reg = C[tipo] && C[tipo][k];
    var lv = C.luva && C.luva[String(dn)];
    var o = { tipo: tipo, material: material, dn: num(dn, 0), dn2: num(dn2, 0), junta: junta, de: tb.de, e: tb.e, origem: {}, fontes: [], aConferir: false };
    /* bolsa da conexão: esgoto = a da LUVA da ficha (D); soldável = a da norma (Tabela 3, a mesma da bolsa do tubo) */
    if (reg && reg.pb) { o.pb = reg.pb; o.origem.pb = "catalogo"; }
    else if (lv && lv.pb) { o.pb = lv.pb; o.origem.pb = "catalogo"; }
    else if (junta === "soldavel" && tb.origem.pb === "norma") { o.pb = tb.pb; o.origem.pb = "norma"; }
    else { o.pb = PROP.pb(tb.de); o.origem.pb = "proporcao"; o.aConferir = true; }
    var odCat = reg && reg.od ? reg.od : (lv && lv.od ? lv.od : (C.joelho90 && C.joelho90[String(dn)] ? C.joelho90[String(dn)].od : null));
    if (odCat) { o.od = odCat; o.origem.od = "catalogo"; } else { o.od = PROP.od(tb.de, junta); o.origem.od = "proporcao"; o.aConferir = true; }
    function cat(campos) { campos.forEach(function (c) { if (reg[c] != null) { o[c] = reg[c]; o.origem[c] = "catalogo"; } }); o.fontes.push(fonte(reg.f, reg.pag)); if (reg.interpretacao) { o.aConferir = true; o.interpretacao = true; } }
    if (reg) cat(Object.keys(reg).filter(function (c) { return ["f", "pag", "interpretacao", "pb", "od"].indexOf(c) < 0; }));
    /* MEDIDA DO PRODUTO (rodada 4 da bancada, 18/10/2026) — esgoto série normal: joelho 45/90, tê e junção com as cotas
       da tabela de dimensões da peça de verdade (a ficha dá o comprimento da linha, mas não a posição do ramal nem a perna
       do joelho 45; onde as duas divergem, vale o produto e a divergência fica em cotas.divergencia).
       Joelho: perna = rCentral·tan(θ/2) + ajuste + b1 + c1 + b2 + b3; raio da curva = rCentral; corpo no deCorpo (a
       diferença para o DN somada ao DE do tubo); bolsa no raioBolsa, funda b1.
       Tê: ponta = a1 + chan1; bolsa da linha = c1 + chan1 + b1; ramal = c + chan2 + b2. Junção: ponta = le1 + chan1;
       bolsa = ld1 + chan1 + b1; ramal (45°) = e + chan2 + b2. Anel da bolsa = raioAnel. */
    var PR = material === "pvc_esgoto" ? produto() : null;
    if (PR && (tipo === "joelho90" || tipo === "joelho45") && PR.joelho && PR.joelho[String(dn)]) {
      var pj = PR.joelho[String(dn)], th = tipo === "joelho90" ? Math.PI / 2 : Math.PI / 4;
      var Lj = Math.round((pj.rCentral * Math.tan(th / 2) + (pj.ajuste || 0) + pj.b1 + pj.c1 + pj.b2 + pj.b3) * 100) / 100;
      if (o.z != null && Math.abs(o.z - Lj) > 1) o.divergencia = "perna do produto " + Lj + " mm × " + o.z + " mm da ficha";
      o.z = Lj; o.zp = Lj; o.pb = pj.b1; o.od = 2 * pj.raioBolsa; o.rCentral = pj.rCentral; o.deCorpo = o.de + (pj.deCorpo - pj.de1);
      o.origem.z = o.origem.zp = o.origem.pb = o.origem.od = "produto"; o.produto = true;
    }
    if (PR && (tipo === "curva90" || tipo === "curva45") && PR.curva && PR.curva[String(dn)]) {
      /* CURVA LONGA: PONTA × BOLSA, raio rCentral e o trecho reto da tangência ('ajuste') */
      var pcv = PR.curva[String(dn)], thc = tipo === "curva90" ? Math.PI / 2 : Math.PI / 4, tc = pcv.rCentral * Math.tan(thc / 2) + (pcv.ajuste || 0);
      o.R = pcv.rCentral; o.rCentral = pcv.rCentral; o.z = Math.round((tc + pcv.b1 + pcv.c1 + pcv.c2 + pcv.c3 + pcv.b3) * 100) / 100; o.zp = Math.round((tc + pcv.b1) * 100) / 100;
      o.pb = pcv.b1; o.od = 2 * pcv.raioBolsa; o.deCorpo = o.de + (pcv.deCorpo - pcv.de1); o.ponta = Math.round(Math.min(o.zp - pcv.rCentral * Math.tan(thc / 2) - 2, pcv.b1 + 6) * 100) / 100;
      ["R", "z", "zp", "pb", "od", "ponta"].forEach(function (c) { o.origem[c] = "produto"; }); o.produto = true;
    }
    if (PR && tipo === "reducao" && PR.reducao && dn2 && PR.reducao[String(dn) + "x" + String(dn2)]) {
      /* REDUÇÃO EXCÊNTRICA: o lado maior é PONTA, o menor BOLSA; geratriz de baixo reta (o esgoto não acumula) */
      var prd = PR.reducao[String(dn) + "x" + String(dn2)];
      o.L = prd.a; o.zg = prd.c; o.zq = Math.round((prd.a - prd.c) * 100) / 100; o.excentrica = true; o.ponta = Math.round(prd.c * 0.45 * 100) / 100;
      o.odPeq = 2 * prd.raioAnel2; o.origem.L = o.origem.zg = o.origem.zq = "produto"; o.produto = true;
    }
    if (PR && (tipo === "te" || tipo === "te_reducao" || tipo === "juncao") && PR.linha) {
      var kl = String(dn) + "x" + String(dn2 || dnRamal || dn), pl = PR.linha[kl];
      if (pl) {
        var antes = o.zb;
        if (tipo === "juncao") { o.zp = pl.le1 + pl.chan1; o.zr = pl.ld1 + pl.chan1 + pl.b1; o.zb = pl.e + pl.chan2 + pl.b2; }
        else { o.zp = pl.a1 + pl.chan1; o.zr = pl.c1 + pl.chan1 + pl.b1; o.zb = pl.c + pl.chan2 + pl.b2; }
        ["zp", "zr", "zb"].forEach(function (c) { o[c] = Math.round(o[c] * 100) / 100; o.origem[c] = "produto"; });
        o.pb = pl.b1; o.od = 2 * pl.raioAnel1; o.origem.pb = o.origem.od = "produto"; o.produto = true;
        if (antes != null && Math.abs(antes - o.zb) > 1) o.divergencia = "ramal a " + o.zb + " mm (produto) × " + antes + " mm (ficha)";
      }
    }
    function prop(c, v) { if (o[c] == null) { o[c] = v; o.origem[c] = "proporcao"; o.aConferir = true; } }
    if (tipo === "joelho90") prop("z", PROP.z90(o.de, o.pb));
    else if (tipo === "joelho45") prop("z", PROP.z45(o.de, o.pb));
    else if (tipo === "te" || tipo === "te_reducao" || tipo === "cruzeta") {
      var j90 = C.joelho90 && C.joelho90[String(dn)];
      prop("zr", j90 ? j90.z : PROP.z90(o.de, o.pb)); prop("zb", o.zr);
      if (tipo === "te_reducao" && dn2) { var cb = cotasTubo(material, dn2); o.deb = cb.de; prop("odb", PROP.od(cb.de, junta)); o.pbb = cotasConexao(material, "luva", dn2).pb; }
    } else if (tipo === "juncao") prop("L", 2 * PROP.z90(o.de, o.pb));
    else if (tipo === "luva" || tipo === "luva_correr") prop("L", 2 * o.pb + 2);
    /* PENDÊNCIAS FINAIS (18/10/2026): UNIÃO soldável (A = face a face, B = Ø da porca, ficha pág. 29) e TÊ DE INSPEÇÃO
       de esgoto (ficha pág. 24: bolsa E, comprimento E + F, tampa de Ø A com a face a B − C/2 do eixo). Sem a cota: a
       proporção declarada (a conferir). A ponta do tê de inspeção não é cotada: a do TÊ comum do mesmo DN (catálogo). */
    else if (tipo === "uniao") { prop("L", 2 * o.pb + 0.55 * o.de + 6); prop("odPorca", o.od * 1.3); }
    else if (tipo === "te_inspecao") {
      var tcI = C.te && C.te[String(dn)];
      if (o.ponta == null && tcI && tcI.ponta) { o.ponta = tcI.ponta; o.origem.ponta = "catalogo"; o.fontes.push(fonte(tcI.f, tcI.pag)); }
      if (o.ponta == null && junta === "anel") { o.ponta = Math.max(20, 0.5 * o.de); o.origem.ponta = "proporcao"; o.aConferir = true; }   /* hid:ok proporção declarada da ponta */
      prop("L", 2 * o.pb + 1.4 * o.de); prop("odTampa", 0.85 * o.de); prop("faceTampa", 0.8 * o.de);
    }
    else if (tipo === "cap") prop("L", o.pb + 0.15 * o.de + 3);
    else if (tipo === "curva90" || tipo === "curva45") prop("R", junta === "eletro" ? PROP.raioCurvaEletro(o.de) : 2 * o.de);
    else if (tipo === "reducao" || tipo === "luva_reducao") { var cp = cotasTubo(material, dn2); o.de2 = cp.de; o.pb2 = cotasConexao(material, "luva", dn2).pb; o.od2 = cotasConexao(material, "luva", dn2).od; prop("L", o.pb + o.pb2 + 0.3 * (o.de - cp.de) + 8); }
    else if (tipo === "bucha") { var cq = cotasTubo(material, dn2); o.de2 = cq.de; o.pb2 = cotasConexao(material, "luva", dn2).pb; prop("L", o.pb2 + 2); }
    if (junta === "eletro" && (tipo === "joelho90" || tipo === "joelho45")) { o.R = PROP.raioCurvaEletro(o.de); o.origem.R = "proporcao"; o.aConferir = true; }
    cotasDoPerfil(o, material, tipo, dn, dnRamal);
    return o;
  }
  /* PERFIL MEDIDO (paridade, 18/10/2026): quando a peça é desenhada pelo perfil medido do produto (conexaoProduto), as
     cotas saem DELE — a face, a profundidade e o externo de cada boca são os da peça desenhada (uma fonte só para o 3D, a
     planta e as cotas). O que a ficha dizia e diverge 0,5 mm ou mais fica em cotas.divergencia. */
  function cotasDoPerfil(o, material, tipo, dn, dnRamal) {
    var pp = perfilProduto(material, tipo, dn); if (!pp) return;
    var div = [];
    function poe(c, v, rotulo) { v = Math.round(v * 100) / 100; if (o[c] != null && Math.abs(o[c] - v) >= 0.5) div.push(rotulo + " " + v + " mm (peça medida) × " + o[c] + " mm (antes)"); o[c] = v; o.origem[c] = "produto (perfil medido)"; }
    /* o externo da BOCA (na face): o anel/friso mais para dentro não é o externo da boca */
    function odBoca(pe) { var ex = pe.ext || []; return ex.length ? 2 * ex[ex.length - 1][1] : 0; }
    var pernas = pp.pernas, luva = pernas.filter(function (x) { return x.luva; })[0] || null;
    if (pp.tipo === "cotovelo") {
      var ang0 = (pp.angulo || 90) * Math.PI / 180, th = /90/.test(tipo) ? Math.PI / 2 : (/45/.test(tipo) ? Math.PI / 4 : ang0);
      var sh = function (v) { return v - (pp.rCentral || 0) * Math.tan(ang0 / 2) + (pp.rCentral || 0) * Math.tan(th / 2); };
      var bolsa = pernas.filter(function (x) { return x !== luva; })[0] || pernas[0];
      poe("z", sh(bolsa.face), "face da bolsa"); poe("pb", bolsa.face - bolsa.conector, "bolsa"); poe("od", odBoca(bolsa), "externo da bolsa");
      /* a perna da LUVA: a peça termina na PONTA (no conector, dentro da luva simples que a abraça desde o luvaIni) */
      if (luva && luva.luvaIni > 0) { poe("zp", sh(pontaFim(luva)), "ponta"); poe("ponta", pontaFim(luva) - luva.luvaIni, "comprimento da ponta"); o.faceLuva = Math.round(sh(luva.face) * 100) / 100; o.luvaIni = Math.round(sh(luva.luvaIni) * 100) / 100; }
      else poe("zp", sh(bolsa.face), "face");
      if (pp.rCentral) { o.rCentral = pp.rCentral; o.R = pp.rCentral; }
    } else if (pp.tipo === "derivacao") {
      /* a derivação medida vale só para o ramal medido (o 100 × 100 não é o 100 × 50 da família) */
      var pRm = pernas.filter(function (x) { return !pernas.some(function (y) { return y !== x && x.d[0] * y.d[0] + x.d[1] * y.d[1] + x.d[2] * y.d[2] < -0.99; }); })[0];
      if (pp.ramalForaDoCatalogo || !pRm || !(pRm.ext || []).length || Math.abs((dnRamal || dn) - pRm.dn) > 0.5) return;
      var linha = pernas.filter(function (x) { return pernas.some(function (y) { return y !== x && x.d[0] * y.d[0] + x.d[1] * y.d[1] + x.d[2] * y.d[2] < -0.99; }); });
      var pA = linha.filter(function (x) { return x.luva; })[0] || linha[0], pB = linha.filter(function (x) { return x !== pA; })[0], pR = pernas.filter(function (x) { return linha.indexOf(x) < 0; })[0];
      if (!pA || !pB || !pR) return;
      if (pA.luva && pA.luvaIni > 0) { poe("zp", pontaFim(pA), "ponta"); poe("ponta", pontaFim(pA) - pA.luvaIni, "comprimento da ponta"); o.faceLuva = pA.face; o.luvaIni = pA.luvaIni; }
      else poe("zp", pA.face, "face da linha"); poe("zr", pB.face, "face da linha"); poe("pb", pB.face - pB.conector, "bolsa"); poe("od", odBoca(pB), "externo da bolsa");
      if (!pp.ramalForaDoCatalogo && (pR.ext || []).length && Math.abs((dnRamal || dn) - pR.dn) < 0.5) poe("zb", pR.face, "face do ramal");
    } else if (pp.tipo === "reta") {
      var ls = pernas.filter(function (x) { return x.face > 1; });
      if (ls.length === 1) { poe("L", ls[0].face, "comprimento"); poe("pb", Math.abs(ls[0].conector), "bolsa"); }
      else if (ls.length >= 2) { poe("L", ls[0].face + ls[1].face, "comprimento"); poe("pb", ls[0].face - ls[0].conector, "bolsa"); poe("od", odBoca(ls[0]), "externo"); }
    }
    o.produto = true; o.perfilMedido = pp.familia; o.aConferir = false;
    if (div.length) o.divergencia = (o.divergencia ? o.divergencia + "; " : "") + div.join("; ");
  }

  /* ======================================================= APARÊNCIA
   * PBR do three r150 (MeshPhysicalMaterial): cor sRGB, rugosidade, metálico e
   * verniz (clearcoat).
   * ⚠ PVC É PLÁSTICO (pedido do Rogério, 17/10/2026: "o marrom está parecendo metálico, igual cobre polido"):
   *   metálico 0, rugosidade 0,5–0,58, SEM verniz e reflexo do ambiente reduzido (env 0,45–0,6). O verniz 0,35 com
   *   rugosidade 0,42 e o ambiente PMREM a 100 % faziam o reflexo especular longo e alaranjado do metal polido.
   *   A cor é a do PRODUTO, tirada das fotos das fichas (campo fonteCor); metal (cobre, aço, latão, cromado) segue metal.
   * Cor por MATERIAL (como a peça é de verdade). A cor por SISTEMA é um modo de
   * vista da tela, não a aparência da peça. */
  var APAR = {
    pvc_soldavel: { cor: "#684427", rug: 0.55, met: 0, verniz: 0, env: 0.5, nome: "PVC soldável marrom",
                    fonteCor: "mediana dos pixels marrons das fotos: catálogo predial (soldável, págs. 12-13) #885D36 e ficha de água fria soldável (joelho, pág. 19) #8F7664" },
    pvc_esgoto: { cor: "#E6E0D2", rug: 0.5, met: 0, verniz: 0, env: 0.45, nome: "PVC esgoto série normal branco",
                  fonteCor: "foto da ficha de esgoto série normal (junção, pág. 18) #E6DECC — branco levemente acinzentado, nunca o branco puro" },
    pvc_serie_r: { cor: "#CDCFCE", rug: 0.5, met: 0, verniz: 0, env: 0.45, nome: "PVC série reforçada cinza-claro", fonteCor: "NBR 5688:2018, cor da série R = cinza-claro (tabela de séries)" },
    pvc_esgoto_enterrado: { cor: "#BF7638", rug: 0.58, met: 0, verniz: 0, env: 0.45, nome: "PVC ocre enterrado", fonteCor: "NBR 7362:2025, tubo ocre (tom a conferir com foto do produto)" },
    ppr: { cor: "#4F8A3C", rug: 0.55, met: 0, verniz: 0, env: 0.5, nome: "PPR verde", fonteCor: "verde da linha PPR (tom a conferir com foto da ficha)" },
    cpvc: { cor: "#E0D2AA", rug: 0.55, met: 0, verniz: 0, env: 0.5, nome: "CPVC creme", fonteCor: "bege/creme da linha CPVC (tom a conferir com foto da ficha)" },
    cobre: { cor: "#B9733F", rug: 0.3, met: 1, verniz: 0, nome: "cobre" },
    cobre_frigorigeno: { cor: "#2E2F31", rug: 0.85, met: 0, verniz: 0, nome: "cobre isolado (espuma elastomérica)" },
    aco_galvanizado: { cor: "#AAB0B4", rug: 0.45, met: 0.85, verniz: 0, nome: "aço galvanizado" },
    aco_preto: { cor: "#3C3D40", rug: 0.5, met: 0.7, verniz: 0, nome: "aço preto" },
    aco_carbono: { cor: "#4A4C50", rug: 0.5, met: 0.7, verniz: 0, nome: "aço carbono" },
    inox: { cor: "#C9CDD0", rug: 0.22, met: 1, verniz: 0, nome: "aço inox" },
    pead: { cor: "#232427", rug: 0.6, met: 0, verniz: 0, env: 0.5, nome: "PEAD preto" },
    elet_corrugado: { cor: "#E5C21F", rug: 0.6, met: 0, verniz: 0, env: 0.5, nome: "eletroduto corrugado amarelo" },
    elet_corrugado_ref: { cor: "#E0782A", rug: 0.6, met: 0, verniz: 0, env: 0.5, nome: "eletroduto corrugado reforçado laranja" },
    elet_roscavel: { cor: "#3E3F42", rug: 0.55, met: 0, verniz: 0, env: 0.5, nome: "eletroduto rígido preto" },
    elet_soldavel: { cor: "#9EA3A7", rug: 0.55, met: 0, verniz: 0, env: 0.5, nome: "eletroduto rígido cinza" },
    duto_chapa: { cor: "#B7BCC0", rug: 0.4, met: 0.8, verniz: 0, nome: "chapa galvanizada" },
    duto_flex: { cor: "#CDD0D2", rug: 0.5, met: 0.9, verniz: 0, nome: "alumínio flexível" },
    eletrocalha: { cor: "#B4B9BD", rug: 0.42, met: 0.8, verniz: 0, nome: "eletrocalha galvanizada" },
    /* CAIXA DE INSPEÇÃO de 0,60 m (pendências finais, 18/10/2026): a alvenaria revestida de argamassa e o concreto pré-moldado */
    alvenaria: { cor: "#9C9890", rug: 0.92, met: 0, verniz: 0, env: 0.35, nome: "alvenaria revestida (argamassa)" },
    concreto: { cor: "#B3B1AB", rug: 0.88, met: 0, verniz: 0, env: 0.35, nome: "concreto pré-moldado" }
  };
  var PAPEL = {
    latao: { cor: "#C9A44C", rug: 0.3, met: 1, verniz: 0, nome: "latão" },
    cromado: { cor: "#E6E9EC", rug: 0.1, met: 1, verniz: 0, nome: "cromado" },
    volante: { cor: "#8E2B2B", rug: 0.5, met: 0.2, verniz: 0, env: 0.6, nome: "volante pintado" },
    azul: { cor: "#2F69B3", rug: 0.52, met: 0, verniz: 0, env: 0.5, nome: "conexão com bucha de latão (azul)" },
    grelha: { cor: "#DADDE0", rug: 0.2, met: 1, verniz: 0, nome: "grelha inox" },
    pintura_incendio: { cor: "#B3201F", rug: 0.45, met: 0.1, verniz: 0.15, nome: "aço pintado de vermelho (IT 17 5.16.5)" },
    anel: { cor: "#1F2023", rug: 0.85, met: 0, verniz: 0, nome: "anel de borracha" },
    fenda: { cor: "#2B2D30", rug: 0.9, met: 0, verniz: 0, nome: "fenda da grelha (vão escuro)" },
    marcador: { cor: "#E0262B", rug: 0.5, met: 0, verniz: 0, nome: "marcador de problema", emissivo: 0.35 },
    ligacao: { cor: "#5B6B7A", rug: 0.5, met: 0, verniz: 0, nome: "ponto de ligação", emissivo: 0.2 },
    ferro: { cor: "#35383C", rug: 0.6, met: 0.7, verniz: 0, nome: "tampão de ferro fundido" },
    tampaConcreto: { cor: "#BDBBB5", rug: 0.9, met: 0, verniz: 0, env: 0.35, nome: "tampa de concreto" }
  };
  function aparencia(material, sistema, papel) {
    if (papel && papel !== "corpo" && PAPEL[papel]) return clone(PAPEL[papel], papel);
    if (sistema === "incendio" && /^aco_/.test(material || "")) return clone(PAPEL.pintura_incendio, "pintura_incendio");
    var a = APAR[material]; return a ? clone(a, material) : clone({ cor: "#9AA0A6", rug: 0.55, met: 0, verniz: 0, env: 0.5, nome: "genérico" }, "generico");
  }
  function clone(a, chave) { var o = { chave: chave }; Object.keys(a).forEach(function (k) { o[k] = a[k]; }); return o; }

  /* ========================================================= PERFIS (mm → m na hora de varrer)
   * boca(s0, sentido, c): o trecho do perfil de UMA bolsa, da face para dentro.
   *   devolve os pontos [s, r] em mm já no sentido do perfil.
   * Bolsa soldável: friso na boca (externo do catálogo), corpo da bolsa 2,5 % menor.
   * Bolsa de anel: alojamento do anel na boca (externo do catálogo) afinando para o corpo. */
  var FOLGA = 1.012;   /* a parede interna da bolsa fica 1,2 % maior que o tubo: o tubo aparece ENTRANDO, sem brigar com a face */
  function rIn(de, junta) { return junta === "anel" ? de / 2 + Math.max(1.4, 0.035 * de) : de / 2 * FOLGA; }
  /* o ANEL DE BORRACHA da junta elástica (esgoto, pluvial, ocre): visível na boca, entre o tubo e a bolsa — a
     folga da bolsa de anel é maior (3,5 % do DE, proporção declarada) justamente para ele aparecer */
  function anelW(c) { return Math.max(2, 0.05 * c.de); }
  /* a PONTA de uma conexão de esgoto (sai a jusante e entra na bolsa do tubo seguinte): do eixo, com chanfro, no
     diâmetro externo do tubo (ela cabe na bolsa), até Lp; s = 0 na ponta, crescendo para dentro da peça */
  /* a ponta é OCA (o furo do tubo aparece na boca, como na peça de verdade — antes era um disco maciço) */
  function pontaPerfil(p, Lp, c) { var r = c.de / 2, ch = Math.min(1.5, c.e * 0.7), ri = Math.max(r * 0.6, r - Math.max(c.e, 1.2)); p.push([Math.min(Lp * 0.8, 0.5 * c.de), 0], [0, ri], [0, r - ch], [ch * 3.7, r], [Lp, r]); }
  /* o perfil do CORPO DO RAMAL (do eixo da linha até o começo da bolsa), mm: na JUNÇÃO ele nasce largo da linha e afina em
     curva de cosseno até o corpo (o "Y" moldado); no tê e na cruzeta, cilindro (a peça de verdade não tem a saia) */
  function perfilRamal(tipo, cbx, rRun, sen, zc) {
    var rcB = raioCorpo(cbx), sSai = rRun / Math.max(0.3, sen), fim = zc - cbx.pb - transicao(cbx);
    var p = [[0, 0]];
    /* rodada final (18/10/2026): o "bulbo" saía de uma saia de 1,3 × o raio; a peça de verdade tem o ramal TUBO reto com uma
       concordância curta e rasa junto da linha */
    var rF = Math.min(rcB * 1.1, rRun * 1.1), sA = sSai * 0.8, sB = Math.min(sSai + 0.22 * cbx.de, fim - 0.5);
    if (tipo === "juncao" && sB > sA + 2 && rF > rcB + 0.2) {
      p.push([0, rF]);
      for (var kf = 0; kf <= 6; kf++) { var tf = kf / 6; p.push([sA + (sB - sA) * tf, rcB + (rF - rcB) * (0.5 + 0.5 * Math.cos(Math.PI * tf))]); }
    } else p.push([0, rcB]);
    p.push([fim, rcB]);
    return p;
  }
  /* o COLAR onde a ponta encontra o corpo (o friso saliente da peça moldada, visível no modelo do fabricante): sobe da
     ponta a um anel um pouco acima do corpo e desce no corpo. Proporção declarada (friso ≤ 1,5 % do DE). */
  function pontaColar(p, c, curto, rcX) {
    var Lp = p[p.length - 1][0], rc = rcX || raioCorpo(c), g = Math.max(0.8, 0.013 * c.de), t = transicao(c), w = Math.max(1.6, 0.025 * c.de);
    p.push([Lp + 0.4, rc + g], [Lp + 0.4 + w, rc + g], [Lp + 0.8 + w, rc], [Lp + (curto ? 1.5 + w : Math.max(t, 1.2 + w)), rc]);
  }
  function anelBorracha(mA, cam, s0, sg, c, segs) {
    if (!mA || c.junta !== "anel") return;
    /* RODADA 2: o anel ficava rente à face da boca e ao tubo (briga de profundidade, borda serrilhada). Agora ele fica
       RECUADO 2,5 mm dentro do furo da bolsa e com folga dos dois lados (0,45 mm do tubo, 0,35 mm da parede): nenhuma
       face dele coincide com outra — aparece como uma faixa escura limpa no fundo da folga */
    var w = anelW(c), a = s0 + sg * 2.5, b = s0 + sg * (2.5 + w), lo = Math.min(a, b), hi = Math.max(a, b);
    var rO = Math.min(rIn(c.de, "anel") - 0.35, c.rMaxAnel || Infinity); if (!(rO > c.de / 2 + 0.6)) rO = c.de / 2 + 0.6;
    varrer(mA, cam, escala([[lo, c.de / 2 + 0.45], [lo, rO], [hi, rO], [hi, c.de / 2 + 0.45]]), segs, true);
  }

  /* perfil de uma peça reta/curva com bolsa nas DUAS pontas (s = 0 … L, mm) */
  function perfilDuasBocas(L, c1, c2, rCorpo) {
    var p = [];
    boca(p, 0, +1, c1);
    p.push([c1.pb + transicao(c1), rCorpo]);
    p.push([L - c2.pb - transicao(c2), rCorpo]);
    var q = []; boca(q, L, -1, c2); q.reverse();
    return p.concat(q);
  }
  function transicao(c) { return c.junta === "anel" ? Math.max(4, 0.15 * c.de) : Math.max(1.5, 0.05 * c.de); }
  /* boca em s0 (face), entrando no sentido sg: pontos do EIXO até o corpo (para sg=+1);
     para sg=−1 a lista é invertida por quem chama */
  function boca(p, s0, sg, c) {
    var ro = c.od / 2, ri = rIn(c.de, c.junta), rec = Math.min(c.pb * 0.85, Math.max(4, 0.55 * c.de)), w;
    if (c.junta === "anel") { rec = Math.max(rec, Math.min(c.pb * 0.9, anelW(c) + 6)); p.push([s0 + sg * rec, 0], [s0 + sg * rec, ri], [s0, ri]); }
    else p.push([s0 + sg * rec, 0], [s0, ri]);   /* o fundo da boca é um cone raso (o tubo o cobre; poupa uma faixa) */
    /* PARIDADE VISUAL (18/10/2026, bancada contra o modelo do fabricante): a boca da peça comprada tem a BORDA
       chanfrada, o RESSALTO (anel saliente na boca) e, no esgoto, o friso logo atrás dele (o alojamento do anel); no
       soldável, o ressalto da boca e o friso no fim da bolsa, onde começa o corpo. Sem eles a bolsa lia como um
       cilindro liso ("as conexões não parecem iguais às conexões como elas são"). Medidas de desenho (proporção
       declarada, ressalto ≤ 5 % do DE); o externo e a profundidade da bolsa continuam os da ficha. */
    var ch = Math.min(1.2, 0.35 + 0.01 * c.de);
    if (c.junta === "anel") {
      var rAnel = ro, rB = Math.max(ri + c.e * 1.4, ro - (ro - ri) * 0.45), g = Math.max(0.7, 0.011 * c.de);
      var w1 = Math.max(2.4, 0.045 * c.de), wg = Math.max(1.2, 0.018 * c.de);
      w = Math.max(w1 + wg + 2, Math.min(c.pb * 0.42, 0.35 * c.de + 6));
      p.push([s0, rAnel - ch], [s0 + sg * ch, rAnel], [s0 + sg * w1, rAnel], [s0 + sg * (w1 + 0.5), rAnel - g], [s0 + sg * (w1 + 0.5 + wg), rAnel - g],
             [s0 + sg * (w1 + 1 + wg), rAnel - 0.3 * g], [s0 + sg * w, rAnel - 0.3 * g], [s0 + sg * Math.min(c.pb - 1, w + Math.max(3, 0.08 * c.de)), rB], [s0 + sg * c.pb, rB]);
    } else if (c.junta === "rosca") {
      w = Math.max(2.5, 0.12 * c.de);
      p.push([s0, ro], [s0 + sg * w, ro], [s0 + sg * w, ro * 0.95], [s0 + sg * c.pb, ro * 0.95]);
    } else {
      w = Math.max(1.6, 0.07 * c.de);
      var rc = ro * 0.955, rf = ro * 0.972, fim = Math.max(w + 2.5, c.pb - 1.4);
      p.push([s0, ro - ch], [s0 + sg * ch, ro], [s0 + sg * w, ro], [s0 + sg * (w + 0.6), rc], [s0 + sg * (fim - 0.5), rc], [s0 + sg * fim, rf], [s0 + sg * c.pb, rf]);
    }
  }
  function raioCorpo(c) {
    if (c.junta === "anel") return Math.max(c.de / 2 + c.e * 1.6, c.de / 2 + 1.5);
    if (c.junta === "capilar") return c.de / 2 + Math.max(0.8, c.e * 1.5);
    return c.od / 2 * 0.94;
  }
  function escala(p) { return p.map(function (x) { return [x[0] * MM, x[1] * MM]; }); }
  function cascaSaida(m, papel) { return { papel: papel || "corpo", malha: m }; }
  /* segmentos na volta: o orçamento de triângulos (TETO_CONEXAO) manda — peça de 3+ bocas usa menos */
  /* RODADA 2: na junta de anel (DE >= 70) a folga entre o tubo e a bolsa é de ~3,5 mm; com 12 a 14 lados o polígono do
     tubo e o da boca (fases diferentes no joelho) "mordiam" essa folga e a faixa escura saía serrilhada. Peça grande
     usa 24 lados (o mesmo número no tubo e na conexão) — teto próprio, TETO_CONEXAO_GRANDE */
  /* PARIDADE VISUAL (18/10/2026): com 12 lados a conexão de água DN 25 saía FACETADA ao lado da peça de verdade (a
     bancada mostrou o polígono na silhueta) — perto, 20 lados (16 com 3 bocas, 14 com 4); o teto acompanha */
  function segsDe(lod, de, bocas) { if (lod === "icone") return 48; /* ícone de catálogo (tools/hid-icones.html): silhueta lisa em 512 px */ if (lod === "longe") return 8; if (de >= 70) return 24; if (bocas >= 4) return 16; if (bocas === 3) return 18; return 20; }
  /* a peça do PERFIL MEDIDO (paridade, 18/10/2026) tem 10–17 quebras por perna e o arco pela corda: teto próprio — com
     mais de 700 elementos a cena já usa o LOD "longe" (8 lados) */
  function tetoConexao(de, produto) { return produto ? (de >= 70 ? 4800 : 3200) : (de >= 70 ? 2800 : 2000); }
  function segsNoTeto(segs, estacoes, de, lod) {
    if (lod === "longe" || lod === "icone") return segs;
    var s2 = Math.floor(tetoConexao(de, true) / (2 * Math.max(1, estacoes)) / 4) * 4;
    return Math.max(16, Math.min(segs, s2));
  }

  /* ============================================================== TUBO
   * t = { p1, p2, material, dn, classe?, sistema }
   * o = { recuo1, recuo2 (m, encurta a ponta para entrar na bolsa), livre1, livre2
   *       (ponta solta: chanfrada), lod }
   * Desenha o tubo OCO com o DE e a espessura da norma, a ponta chanfrada onde
   * ela aparece e, a cada BARRA comercial, a luva (soldável) ou a bolsa do
   * próprio tubo (junta de anel), voltada para montante. */
  function tuboBruto(t, o) {
    o = o || {};
    var c = cotasTubo(t.material, t.dn, t.classe), P1 = pv(t.p1), P2 = pv(t.p2);
    if (o.desloc1) P1 = add(P1, pv(o.desloc1)); if (o.desloc2) P2 = add(P2, pv(o.desloc2));   /* redução excêntrica: o eixo encontra a bolsa deslocada */
    var d = nrmz(sub(P2, P1)), Ltot = len(sub(P2, P1));
    var r1 = Math.max(0, num(o.recuo1, 0)), r2 = Math.max(0, num(o.recuo2, 0));
    if (r1 + r2 > Ltot - 0.002) { var k = (Ltot - 0.002) / Math.max(1e-9, r1 + r2); r1 *= Math.max(0, k); r2 *= Math.max(0, k); }
    var A = add(P1, mul(d, r1)), L = (Ltot - r1 - r2) / MM, ro = c.de / 2, ri = ro - c.e, segs = segsDe(o.lod, c.de);
    var m = new Malha(), mA = new Malha(), ch = Math.min(c.e * 0.6, 2.5), lc = ch / Math.tan(15 * Math.PI / 180);
    if (lc > L / 3) { lc = L / 3; ch = lc * Math.tan(15 * Math.PI / 180); }
    var pf = [[0, ri]];
    if (o.livre1) pf.push([0, ro - ch], [lc, ro]); else pf.push([0, ro]);
    if (o.livre2) pf.push([L - lc, ro], [L, ro - ch]); else pf.push([L, ro]);
    pf.push([L, ri]);
    varrer(m, reta(A, d), escala(pf), segs, true);
    /* bolsa PRÓPRIA numa ponta (o tubo de jusante de um joelho/tê/junção de esgoto recebe a ponta da conexão nela):
       a boca fica bolsaAtras ANTES do começo do tubo, voltada para a conexão */
    [[o.bolsaAtras1, A, d], [o.bolsaAtras2, add(A, mul(d, L * MM)), mul(d, -1)]].forEach(function (bx) {
      if (bx[0] == null || c.junta !== "anel") return;
      var cxb = cotasConexao(t.material, "luva", t.dn), bc0 = { de: c.de, e: c.e, pb: c.pb, od: cxb.od, junta: c.junta }, pfb0 = [];
      boca(pfb0, 0, +1, bc0);
      pfb0.push([c.pb + transicao(bc0), ro * 0.999], [c.pb + transicao(bc0) + 1, ro * 0.999], [c.pb + transicao(bc0) + 1, 0]);
      var camB0 = reta(add(bx[1], mul(bx[2], -bx[0])), bx[2]);
      varrer(m, camB0, escala(pfb0), segs, false); anelBorracha(mA, camB0, 0, +1, bc0, segs);
    });
    var juntas = [];
    if (c.barra && Ltot / MM > c.barra * 1000 + 1) {
      var cx = cotasConexao(t.material, "luva", t.dn);
      for (var s = c.barra; s < Ltot - 0.05; s += c.barra) {
        var J = add(P1, mul(d, s));
        if (s < r1 + 0.05 || s > Ltot - r2 - 0.05) continue;
        if (c.junta === "soldavel") {   /* luva de correr NÃO: a emenda de barra é a luva soldável comum */
          var Lm = cx.L / 2;
          varrer(m, reta(add(J, mul(d, -Lm * MM)), d), escala(perfilDuasBocas(cx.L, cx, cx, raioCorpo(cx))), segs, false);
        } else {   /* bolsa do próprio tubo, boca para montante (a ponta da barra de cima entra nela) */
          var bc = { de: c.de, e: c.e, pb: c.pb, od: cx.od, junta: c.junta }, pfb = [];
          boca(pfb, 0, +1, bc);
          pfb.push([c.pb + transicao(bc), ro * 0.999], [c.pb + transicao(bc) + 1, ro * 0.999], [c.pb + transicao(bc) + 1, 0]);
          var camB = reta(add(J, mul(d, -c.pb * MM)), d);
          varrer(m, camB, escala(pfb), segs, false); anelBorracha(mA, camB, 0, +1, bc, segs);
        }
        juntas.push({ s: s, tipo: c.junta === "soldavel" ? "luva" : "bolsa" });
      }
    }
    var partesT = [cascaSaida(m)]; if (mA.idx.length) partesT.push(cascaSaida(mA, "anel"));
    return { partes: partesT, cotas: c, juntas: juntas, inicio: A, fim: add(A, mul(d, L * MM)), aConferir: c.aConferir };
  }

  /* ====================================================== CACHE POR PEÇA (FLUIDEZ, rodada 4, 18/10/2026)
   * Cada troca de parâmetro refazia a geometria de TODOS os tubos e conexões (varrer o perfil, anéis, bolsas) — ~40 a
   * 70 ms no modelo médio. A forma de um tubo depende só do tipo, do DN, da classe, do vetor p1 → p2 e das opções
   * (recuos, pontas livres, bolsas, deslocamentos, nível de detalhe); a de uma conexão, do tipo, do material, dos DN e
   * das DIREÇÕES dos ramos. Então a chave é isso (relativo à âncora: p1 do tubo, o ponto da conexão) e a "matriz por
   * instância" é a translação até a âncora: a mesma peça em outro lugar (os banheiros copiados) e a peça que não mudou
   * entre duas reconstruções saem do cache, só transladadas (cópia das listas — quem recebe pode mexer nelas).
   * As portas da conexão levam o trecho/lado do nó ATUAL (o índice do eixo fica guardado). No máximo 6000 formas
   * (as mais antigas saem). HidGeo.cache: { ligado, acertos, faltas, limpar() }. */
  var CACHE = { m: new Map(), ligado: true, acertos: 0, faltas: 0, MAX: 6000 };
  function rq(v) { return typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v; }
  function chaveDe(obj) { return JSON.stringify(obj, function (k, v) { return typeof v === "number" ? rq(v) : (typeof v === "function" ? "fn" : v); }); }
  function semCampos(o, fora) { var r = {}; Object.keys(o || {}).forEach(function (k) { if (fora.indexOf(k) < 0) r[k] = o[k]; }); return r; }
  function malhaTransl(ml, T) {
    var n = Object.create(Malha.prototype);
    Object.keys(ml).forEach(function (k) { var v = ml[k]; n[k] = Array.isArray(v) ? v.slice() : v; });
    var ps = ml.pos, q = new Array(ps.length);
    for (var i = 0; i < ps.length; i += 3) { q[i] = ps[i] + T[0]; q[i + 1] = ps[i + 1] + T[1]; q[i + 2] = ps[i + 2] + T[2]; }
    n.pos = q; n.cascas = (ml.cascas || []).map(function (c) { return c.slice(); });
    return n;
  }
  function partesTransl(partes, T) { return (partes || []).map(function (pt) { var o = {}; Object.keys(pt).forEach(function (k) { o[k] = pt[k]; }); if (pt.malha) o.malha = malhaTransl(pt.malha, T); return o; }); }
  function guardar(k, v) {
    if (CACHE.m.size >= CACHE.MAX) { var it = CACHE.m.keys(); for (var i = 0; i < 1000; i++) CACHE.m.delete(it.next().value); }
    CACHE.m.set(k, v);
  }
  function achar(k) { var v = CACHE.m.get(k); if (v) { CACHE.m.delete(k); CACHE.m.set(k, v); } return v; }   /* a usada vai para o fim (sai por último) */
  function tubo(t, o) {
    if (!CACHE.ligado || !t || !t.p1 || !t.p2) return tuboBruto(t, o);
    var P1 = pv(t.p1), P2 = pv(t.p2), k = "t" + chaveDe({ t: semCampos(t, ["p1", "p2", "id", "avisos", "comprimento", "comprimentoH", "desnivel", "inclinacao"]), d: sub(P2, P1), o: o || {} });
    var c = achar(k);
    if (c) {
      CACHE.acertos++;
      var r = {}; Object.keys(c).forEach(function (x) { r[x] = c[x]; });
      r.partes = partesTransl(c.partes, P1); r.inicio = add(c.inicio, P1); r.fim = add(c.fim, P1); r.juntas = (c.juntas || []).map(function (j) { return { s: j.s, tipo: j.tipo }; });
      return r;
    }
    CACHE.faltas++;
    var g = tuboBruto(t, o); if (!g) return g;
    var mP = mul(P1, -1), rel = {}; Object.keys(g).forEach(function (x) { rel[x] = g[x]; });
    rel.partes = partesTransl(g.partes, mP); rel.inicio = add(g.inicio, mP); rel.fim = add(g.fim, mP);
    guardar(k, rel);
    return g;
  }
  function conexao(c, eixos, o) {
    if (!CACHE.ligado || !c || !eixos) return conexaoBruta(c, eixos, o);
    /* o.trechos (o no() passa TODOS os trechos, com posição) só serve à redução excêntrica: entra na chave só a
       orientação dela em cada ramo — com o mapa inteiro a chave era única por lugar e enorme */
    var oo = o || {}, TR = oo.trechos || null;
    var P = pv(c), ex = eixos.map(function (e) { var tr = TR && TR[e.trecho]; return { l: e.lado, d: e.dir, dn: e.dn, m: e.material, p: !!e.passante, x: tr && tr.excentrica ? tr.excentrica : null }; });
    var k = "c" + chaveDe({ c: semCampos(c, ["x", "y", "z", "id", "ramos", "juntaDe", "nome", "sinapi", "codigo"]), e: ex, o: semCampos(oo, ["trechos"]) });
    var h = achar(k);
    if (h) {
      CACHE.acertos++;
      var r = {}; Object.keys(h).forEach(function (x) { r[x] = h[x]; });
      r.partes = partesTransl(h.partes, P);
      r.portas = h.portas.map(function (pt) { var q = {}; Object.keys(pt).forEach(function (x) { q[x] = pt[x]; }); var e = eixos[pt._eixo]; if (e) { q.trecho = e.trecho; q.lado = e.lado; } delete q._eixo; return q; });
      return r;
    }
    CACHE.faltas++;
    var g = conexaoBruta(c, eixos, o); if (!g) return g;
    var portasRel = (g.portas || []).map(function (pt) {
      var q = {}; Object.keys(pt).forEach(function (x) { q[x] = pt[x]; });
      for (var i = 0; i < eixos.length; i++) if (eixos[i].trecho === pt.trecho && eixos[i].lado === pt.lado) { q._eixo = i; break; }
      return q;
    });
    if (portasRel.some(function (q) { return q._eixo == null; })) return g;   /* porta sem eixo conhecido: não guarda */
    var rel = {}; Object.keys(g).forEach(function (x) { rel[x] = g[x]; });
    rel.partes = partesTransl(g.partes, mul(P, -1)); rel.portas = portasRel;
    guardar(k, rel);
    return g;
  }

  /* ============================================================ CONEXÕES */
  /* as direções de cada ramo que chega ao nó (saindo dele), com o trecho e a ponta (0 = p1, 1 = p2) */
  function eixosDoNo(P, ramosIds, trechosPorId, tol) {
    var Pv = pv(P), out = [], T = tol || 0.02;
    (ramosIds || []).forEach(function (id) {
      var t = trechosPorId[id]; if (!t) return;
      var a = pv(t.p1), b = pv(t.p2);
      if (len(sub(a, Pv)) <= T) out.push({ trecho: id, lado: 0, dir: nrmz(sub(b, a)), dn: t.dn, material: t.material });
      else if (len(sub(b, Pv)) <= T) out.push({ trecho: id, lado: 1, dir: nrmz(sub(a, b)), dn: t.dn, material: t.material });
      else { var d = nrmz(sub(b, a)); out.push({ trecho: id, lado: -1, dir: d, dn: t.dn, material: t.material, passante: true }, { trecho: id, lado: -1, dir: mul(d, -1), dn: t.dn, material: t.material, passante: true }); }
    });
    return out;
  }
  /* o ramo de JUSANTE no nó: o trecho que COMEÇA nele (o esgoto escoa de p1 para p2), com pelo menos um que chega */
  function jusante(lista) { var j = lista.filter(function (e) { return e && !e.passante && e.lado === 0; }), mo = lista.filter(function (e) { return e && !e.passante && e.lado === 1; }); return j.length === 1 && mo.length >= 1 ? j[0] : null; }
  function desvio(d1, d2) { return Math.acos(Math.max(-1, Math.min(1, -dot(d1, d2)))) * 180 / Math.PI; }

  /* a PEÇA PRINCIPAL de um nó: joelho, curva, tê, junção, luva, redução, cruzeta.
     c = { tipo, material, dn, dn2, x, y, z, sistema }, eixos = eixosDoNo(...).
     Devolve { partes, portas:[{trecho, lado, recuo (m)}], cotas, aConferir } ou null. */

  /* ======================================================== PEÇA PELO PERFIL MEDIDO DO PRODUTO
   * (paridade, 18/10/2026 — "a conexão tem que ficar igualzinha à peça"). Cada perna é a revolução do PERFIL medido na
   * peça de verdade (dados-fonte/hidro/geometria/produto-perfis.json: raio externo ao longo do eixo, do fim da zona de
   * encontro até a face, e o furo): no joelho/curva o caminho é a curva do raio central, na derivação a linha reta e o
   * ramal. O tubo começa no CONECTOR da perna (ele entra na luva/bolsa da peça e fica escondido nela); do lado da LUVA
   * (a ponta da peça) a luva simples do produto abraça a ponta e o tubo começa na face dela. */
  var CHAVE_PERFIL = { pvc_esgoto: { joelho90: "esg-joelho", joelho45: "esg-joelho", curva90: "esg-curva", curva45: "esg-curva", juncao: "esg-juncao", te: "esg-te", te_reducao: "esg-te", luva: "esg-luva" },
                       pvc_soldavel: { joelho90: "af-joelho", joelho45: "af-joelho", te: "af-te", te_reducao: "af-te", luva: "af-luva", joelho_bucha: "af-joelhoazul" } };
  function segsProduto(lod, dn) { if (lod === "longe") return 8; if (lod === "icone") return 64; return dn >= 100 ? 40 : (dn >= 75 ? 32 : (dn >= 40 ? 24 : 20)); }
  /* o FIM DA PONTA na perna da luva: o conector da família quando ele fica dentro da luva (tê/junção: a ponta entra até o
     meio dela); no joelho/curva a família põe o conector no começo da luva — a ponta vai então até o meio da luva */
  function pontaFim(pe) { return pe.conector - pe.luvaIni >= 10 ? pe.conector : pe.luvaIni + (pe.face - pe.luvaIni) / 2; }
  function perfilProduto(material, tipo, dn) {
    var PR = produto(), base = (CHAVE_PERFIL[material] || {})[tipo]; if (!base || !PR || !PR.perfis) return null;
    return PR.perfis[base + "-" + dn] || null;
  }
  /* o perfil de UMA perna no eixo dela (mm): pontos [s, r] do fim da zona de encontro à face; antes do 1º ponto, o 1º raio */
  function pernaPts(pe) {   /* fecha na FACE (o último raio vai até ela: sem chanfro falso entre a última seção e a face) */
    var p = (pe.ext || []).map(function (q) { return [q[0], q[1]]; });
    if (p.length && pe.face > p[p.length - 1][0] + 1e-6) p.push([pe.face, p[p.length - 1][1]]);
    return p;
  }
  function conexaoProduto(c, eixos, o, pp) {
    /* lados múltiplos de 4 (a silhueta tem vértice nos quatro eixos) e mais lados no DN grande: a peça medida não pode sair facetada */
    var P = pv(c), lod = o.lod, m = new Malha(), portas = [], segs = segsProduto(lod, c.dn);
    var pernas = pp.pernas.slice(), luvaP = pernas.filter(function (x) { return x.luva; })[0] || null;
    /* as portas na semântica de sempre: BOLSA = face em z, o tubo entra até o conector (recuo = z − pb); PONTA (a perna da
       luva) = o tubo começa na face dela e a bolsa do tubo, ou a luva simples, a cobre (bolsaAtras = ponta − 1) */
    function portaB(e, face, conector, extra) { if (e.passante) return; var q = { trecho: e.trecho, lado: e.lado, dir: e.dir, recuo: conector * MM, z: face * MM, pb: (face - conector) * MM, dn: e.dn }; for (var k in (extra || {})) q[k] = extra[k]; portas.push(q); }
    /* a perna da LUVA (perfis: luva + luvaIni): a peça vai até o conector com a PONTA no raio do corpo; a luva simples que a
       abraça (do luvaIni à face, medida na mesma família) sai como parte própria (luvaEixo) — o nó (no) entrega essa parte à
       luva da regra das juntas (biminst.juntasDaPonta) ou a tira, quando a bolsa do tubo cobre a ponta */
    var partesLuva = [], rTuboP = cotasTubo(c.material, c.dn).de / 2;
    function rBoca(pe) { var ex = (pe && pe.ext) || []; return ex.length ? ex[ex.length - 1][1] : null; }
    function pernaSemLuva(pe) {
      var pts = pernaPts(pe); if (!pe.luva || !(pe.luvaIni > 0)) return pts;
      /* a PONTA (no DE do tubo: cabe na luva e na bolsa do tubo) do começo da luva até o fim dela (pontaFim) */
      return pts.filter(function (q) { return q[0] < pe.luvaIni - 1e-6; }).concat([[pe.luvaIni, pts[0][1]], [pe.luvaIni + 0.3, rTuboP], [pontaFim(pe), rTuboP]]);
    }
    function luvaDaPerna(pe, dir, desl, iE) {
      if (!pe.luva || !(pe.luvaIni > 0)) return;
      var rC = pernaPts(pe)[0][1], rIn = rC + 0.3, pts = pernaPts(pe).filter(function (q) { return q[0] >= pe.luvaIni - 1e-6; });
      if (pts.length < 2) return;
      var ml = new Malha(), lp = [[pe.luvaIni + desl, rIn]].concat(pts.map(function (q) { return [q[0] + desl, q[1]]; })).concat([[pe.face + desl, rIn]]);
      varrer(ml, reta(P, dir), escala(lp), segs, true);
      var pt = cascaSaida(ml); pt.luvaEixo = iE; partesLuva.push(pt);
    }
    /* o tubo de jusante começa no FIM DA PONTA (dentro da luva; sem a luva, a bolsa dele cobre a ponta: bolsaAtras) */
    function portaP(e, face, fim, luvaIni, rB) { if (e.passante) return; var ponta = Math.max(0, fim - luvaIni);
      portas.push({ trecho: e.trecho, lado: e.lado, dir: e.dir, recuo: fim * MM, z: face * MM, pb: (face - fim) * MM, dn: e.dn, ponta: ponta * MM, bolsaAtras: Math.max(0, ponta - 1) * MM, faceProduto: face * MM, produto: true, rBoca: rB }); }
    if (pp.tipo === "cotovelo") {
      if (eixos.length < 2) return null;
      var jus = jusante(eixos) || eixos[0], mon = jus === eixos[0] ? eixos[1] : eixos[0];
      var pJ = luvaP || (o.pernaJus != null ? pernas.filter(function (x) { return String(x.id) === String(o.pernaJus); })[0] : null) || pernas[0], pM = pernas.filter(function (x) { return x !== pJ; })[0] || pJ;
      var rc = pp.rCentral || 0, ang0 = (pp.angulo || 90) * Math.PI / 180, del = desvio(jus.dir, mon.dir) * Math.PI / 180;
      var tl0 = rc * Math.tan(ang0 / 2), tl = rc * Math.tan(del / 2);
      /* a perna reta do produto não muda com o ângulo: os s medidos andam junto com a tangência */
      var sh = function (sv) { return sv - tl0 + tl; };
      var ptsJ = pernaSemLuva(pJ), ptsM = pernaPts(pM), zJ = sh(ptsJ[ptsJ.length - 1][0]), zM = sh(pM.face);
      var rb = pp.rArco || Math.min(ptsJ[0][1], ptsM[0][1]), furo = Math.min(pJ.furo || rb * 0.9, pM.furo || rb * 0.9);
      /* o ARCO: a linha de centro e o raio do corpo medidos no próprio arco (rcArco/rArco: o joelho soldável tem o lado de
         fora mais chato que o toro do raio central nominal); as pernas continuam no lugar medido */
      var rcA = pp.rcArco || rc;
      /* estações do arco pela CORDA (≤ 0,08 mm do lado de fora): o joelho de 20 não precisa das 24 da curva longa de 100;
         a curva longa tem no mínimo 24 (pedido da rodada final) */
      var rOut = Math.max(1, rcA + rb), nArc = Math.max(8, Math.min(48, Math.ceil(del / (2 * Math.acos(Math.max(-1, 1 - 0.08 / rOut))))));
      if (/curva/.test(c.tipo)) nArc = Math.max(nArc, 24);
      var cam = cotovelo(P, jus.dir, mon.dir, zJ * MM, zM * MM, Math.max(1, rcA) * MM, o.passoArco || (lod === "longe" ? Math.PI / 4 : del / nArc * 1.0001));
      var Lc = cam.L / MM, tlA = (cam.Rb / MM) * Math.tan(del / 2), l1 = zJ - tlA, la = Lc - l1 - (zM - tlA);
      var ext = [];
      ptsJ.slice().reverse().forEach(function (q) { ext.push([zJ - sh(q[0]), q[1]]); });            /* da face J até a tangência */
      if (pp.arco && pp.arco.length) {                                                          /* o corpo que afina no arco */
        pp.arco.forEach(function (q) { var fr = pJ.id === pp.arcoDe ? q[0] : 1 - q[0]; ext.push([l1 + la * fr, q[1]]); });
      } else ext.push([l1, rb], [l1 + la, rb]);                                                  /* a curva no raio do corpo */
      ptsM.forEach(function (q) { ext.push([Lc - (zM - sh(q[0])), q[1]]); });                   /* da tangência à face M */
      ext = ext.filter(function (q) { return q[0] >= -1e-6 && q[0] <= Lc + 1e-6; }).sort(function (x, y) { return x[0] - y[0]; });
      var loop = [[0, furo]].concat(ext).concat([[Lc, furo]]);
      segs = segsNoTeto(segs, loop.length + cam.estacoes.length, cotasTubo(c.material, c.dn).de, lod);
      varrer(m, cam, escala(loop), segs, true);
      if (pJ.luva && pJ.luvaIni > 0) { luvaDaPerna(pJ, jus.dir, tl - tl0, eixos.indexOf(jus)); portaP(jus, sh(pJ.face), sh(pontaFim(pJ)), sh(pJ.luvaIni), rBoca(pJ)); }
      else portaB(jus, zJ, sh(pJ.conector), { rBoca: rBoca(pJ) });
      portaB(mon, zM, sh(pM.conector), { rBoca: rBoca(pM) });
    } else if (pp.tipo === "derivacao") {
      if (eixos.length < 3) return null;
      var par = null, best = 1e9;
      for (var i = 0; i < eixos.length; i++) for (var j = i + 1; j < eixos.length; j++) { var dv = desvio(eixos[i].dir, eixos[j].dir); if (dv < best) { best = dv; par = [i, j]; } }
      var ra = eixos[par[0]], rbE = eixos[par[1]], ram = eixos.filter(function (_, k) { return k !== par[0] && k !== par[1]; })[0];
      var jR = jusante([ra, rbE]); if (jR && jR !== ra) { var tmp = ra; ra = rbE; rbE = tmp; }
      var linha = pernas.filter(function (x) { return pernas.some(function (y) { return y !== x && dot(x.d, y.d) < -0.99; }); });
      var pA = linha.filter(function (x) { return x.luva; })[0] || linha[0], pB = linha.filter(function (x) { return x !== pA; })[0], pR = pernas.filter(function (x) { return linha.indexOf(x) < 0; })[0];
      if (!pA || !pB || !pR) return null;
      /* só a COMBINAÇÃO MEDIDA (linha × ramal da família): o tê/junção 100 × 100 tem outra linha (mais comprida, o ramal
         maior pede mais corpo) — com o ramal de outro DN a peça sai pela construção da ficha/produto (conexaoBruta) */
      if (pp.ramalForaDoCatalogo || !(pR.ext || []).length || Math.abs((ram.dn || c.dn) - pR.dn) > 0.5) return null;
      var A = pernaSemLuva(pA), B = pernaPts(pB), zA = A[A.length - 1][0], zB = pB.face, LR = zA + zB;
      var ext2 = [];
      A.slice().reverse().forEach(function (q) { ext2.push([zA - q[0], q[1]]); });
      ext2.push([zA - A[0][0], A[0][1]], [zA + B[0][0], B[0][1]]);
      B.forEach(function (q) { ext2.push([zA + q[0], q[1]]); });
      ext2.sort(function (x, y) { return x[0] - y[0]; });
      var furoL = Math.min(pA.furo || A[0][1] * 0.9, pB.furo || B[0][1] * 0.9);
      segs = segsNoTeto(segs, ext2.length + 2 + (pR.ext || []).length + 4, cotasTubo(c.material, c.dn).de, lod);
      varrer(m, reta(add(P, mul(ra.dir, zA * MM)), mul(ra.dir, -1)), escala([[0, furoL]].concat(ext2).concat([[LR, furoL]])), segs, true);
      /* o RAMAL: de dentro da linha (o corpo cobre) até a face, no perfil medido; antes do 1º ponto, o 1º raio */
      var R = pernaPts(pR), s0R = Math.max(1, Math.min(A[0][1], B[0][1]) * 0.5), extR = [[s0R, R[0][1]], [R[0][0], R[0][1]]].concat(R);
      var furoR = pR.furo || R[0][1] * 0.9;
      varrer(m, reta(P, ram.dir), escala([[s0R, furoR]].concat(extR).concat([[pR.face, furoR]])), segs, true);
      if (pA.luva && pA.luvaIni > 0) { luvaDaPerna(pA, ra.dir, 0, eixos.indexOf(ra)); portaP(ra, pA.face, pontaFim(pA), pA.luvaIni, rBoca(pA)); }
      else portaB(ra, zA, pA.conector, { rBoca: rBoca(pA) });
      portaB(rbE, zB, pB.conector, { rBoca: rBoca(pB) });
      portaB(ram, pR.face, pR.conector, { ramal: true, rBoca: rBoca(pR) });
    } else if (pp.tipo === "reta" && c.material !== "pvc_esgoto") {
      /* LUVA (soldável): as duas pernas medidas, de face a face pelo centro */
      if (eixos.length < 2) return null;
      var e1 = jusante(eixos) || eixos[0], e2 = e1 === eixos[0] ? eixos[1] : eixos[0];
      var q1 = pernas[0], q2 = pernas[1] || pernas[0], P1 = pernaPts(q1), P2 = pernaPts(q2), z1 = q1.face, z2 = q2.face, ext3 = [];
      P1.slice().reverse().forEach(function (q) { ext3.push([z1 - q[0], q[1]]); });
      P2.forEach(function (q) { ext3.push([z1 + q[0], q[1]]); });
      ext3.sort(function (x, y) { return x[0] - y[0]; });
      var fu = Math.min(q1.furo || P1[0][1] * 0.9, q2.furo || P2[0][1] * 0.9);
      varrer(m, reta(add(P, mul(e1.dir, z1 * MM)), mul(e1.dir, -1)), escala([[0, fu]].concat(ext3).concat([[z1 + z2, fu]])), segs, true);
      portaB(e1, z1, q1.conector, { rBoca: rBoca(q1) }); portaB(e2, z2, q2.conector, { rBoca: rBoca(q2) });
    } else return null;
    /* as cotas da peça: as do perfil medido (cotasDoPerfil), com a ficha no que não foi medido */
    /* o ANEL DE BORRACHA da junta elástica em cada boca (o mesmo de sempre: recuado 2,5 mm, com folga do tubo e da parede);
       na boca da luva da família ele vai junto com a luva (luvaEixo) */
    var partesAnel = [], tbA = cotasTubo(c.material, c.dn);
    if (tbA.junta === "anel") portas.forEach(function (q) {
      var e = eixos.filter(function (x) { return x.trecho === q.trecho && x.lado === q.lado; })[0]; if (!e) return;
      /* o anel fica DENTRO da bolsa medida (a do produto é mais fina que a da ficha): no máximo a 1 mm da face externa */
      var ca = { de: cotasTubo(c.material, e.dn || c.dn).de, junta: "anel", rMaxAnel: q.rBoca ? q.rBoca - 1.0 : null }, mA = new Malha();
      anelBorracha(mA, reta(add(P, mul(q.dir, q.z)), mul(q.dir, -1)), 0, +1, ca, segs);
      if (!mA.idx.length) return;
      var pa = cascaSaida(mA, "anel"); if (q.produto && partesLuva.some(function (pl) { return pl.luvaEixo === eixos.indexOf(e); })) pa.luvaEixo = eixos.indexOf(e);
      partesAnel.push(pa);
    });
    var ramD = 0; if (pp.tipo === "derivacao") eixos.forEach(function (e) { if (portas.some(function (q) { return q.ramal && q.trecho === e.trecho && q.lado === e.lado; })) ramD = e.dn; });
    var ct = cotasConexao(c.material, c.tipo, c.dn, c.dn2 || 0, ramD || undefined); ct.chave = pp.familia; ct.aConferir = false;
    return { partes: [cascaSaida(m)].concat(partesLuva).concat(partesAnel), portas: portas, cotas: ct, aConferir: false };
  }
  /* a LUVA SIMPLES do produto na ponta: o conector dela (no meio do comprimento) coincide com a face da ponta; o tubo
     começa ali (dentro da luva). Devolve null sem o perfil — fica a luva de antes. */
  function luvaProduto(material, dn, P, dir, zFace, lod) {
    var pl = perfilProduto(material, "luva", dn); if (!pl) return null;
    var pe = pl.pernas.filter(function (x) { return x.face > 1; })[0]; if (!pe) return null;
    var L = pe.face, cn = Math.abs(pe.conector), s0 = zFace - cn, m = new Malha(), segs = segsProduto(lod, dn);
    var ext = pernaPts(pe); if (ext[0][0] > 0) ext.unshift([0, ext[0][1]]);
    varrer(m, reta(add(pv(P), mul(dir, s0 * MM)), dir), escala([[0, pe.furo || ext[0][1] * 0.9]].concat(ext).concat([[L, pe.furo || ext[0][1] * 0.9]])), segs, true);
    return { partes: [cascaSaida(m)], recuo: zFace * MM, cotas: { produto: true, chave: pl.familia }, aConferir: false };
  }
  function conexaoBruta(c, eixos, o) {
    o = o || {};
    /* a peça medida do produto, quando há o perfil (esgoto série normal e soldável); senão, a construção de antes */
    var ppP = c && perfilProduto(c.material, c.tipo, c.dn);
    if (ppP && eixos && eixos.length) { var rP = conexaoProduto(c, eixos, o, ppP); if (rP) return rP; }
    var P = pv(c), tipo = c.tipo, mat = c.material, J = JUNTA[mat];
    if (!J || !eixos || !eixos.length) return null;
    var lod = o.lod, m = new Malha(), mA = new Malha(), portas = [], cot;
    /* a ponta: o tubo de jusante começa no fim dela e ganha a BOLSA PRÓPRIA cobrindo-a (boca a 1 mm da raiz) */
    function portaPonta(e, z, Lp) { if (!e.passante) portas.push({ trecho: e.trecho, lado: e.lado, dir: e.dir, recuo: z * MM, z: z * MM, pb: 0, dn: e.dn, ponta: Lp * MM, bolsaAtras: Math.max(0, Lp - 1) * MM }); }
    function porta(e, z, pb, ramal) { if (!e.passante) portas.push({ trecho: e.trecho, lado: e.lado, dir: e.dir, recuo: Math.max(0, (z - pb)) * MM, z: z * MM, pb: pb * MM, dn: e.dn, ramal: !!ramal }); }
    if (tipo === "joelho90" || tipo === "joelho45" || tipo === "curva90" || tipo === "curva45") {
      if (eixos.length < 2) return null;
      var a = eixos[0], b = eixos[1];
      cot = cotasConexao(mat, tipo, c.dn);
      var de = cot.de, z, Rb;
      if (cot.R != null && !cot.produto) { var del = desvio(a.dir, b.dir) * Math.PI / 180; Rb = cot.R; z = Rb * Math.tan(del / 2) + cot.pb + 2; }
      else if (cot.R != null) { z = cot.z; Rb = cot.R; }
      else { z = cot.z; Rb = Math.max(cot.od / 2 * 1.05, (z - cot.pb) * 0.9); }
      var jus = cot.ponta ? jusante([a, b]) : null;
      if (jus) {   /* esgoto: a perna de JUSANTE é ponta (desenho cotado da ficha) — o caminho começa nela */
        var mon = jus === a ? b : a, zp = cot.zp || z, zq = cot.z || z;
        /* RODADA 3 da bancada (18/10/2026): o joelho moldado tem a curva CURTA (raio ~ o do corpo) e a PONTA sai RETA da
           curva, no diâmetro do tubo; com o raio grande de antes a ponta sumia dentro da curva e as duas bocas liam
           iguais e largas (o 45 parecia um 90). Sem a cota da perna na ficha (joelho 45), a perna da ponta é a ponta + a
           tangente da curva (proporção, aConferir). */
        var delJ = desvio(jus.dir, mon.dir) * Math.PI / 180, rcJ = cot.deCorpo ? cot.deCorpo / 2 : raioCorpo(cot);
        Rb = cot.rCentral || raioCorpo(cot) * 0.8;
        var tlJ = Rb * Math.tan(delJ / 2);
        if (zp < cot.ponta + tlJ + 1) { zp = cot.ponta + tlJ + 1; cot.aConferir = true; cot.origem.zp = "proporcao"; }
        if (zq < cot.pb + tlJ + 1) { zq = cot.pb + tlJ + 1; cot.aConferir = true; }
        /* a CURVA LONGA no Alto/ícone: o arco em passos de 3,75° (24 no de 90°) — com 8 a curvatura saía em gomos (18/10/2026) */
        var passoC = lod === "longe" ? Math.PI / 4 : (/^curva/.test(tipo) ? Math.PI / 48 : Math.PI / 8);
        var camP = cotovelo(P, jus.dir, mon.dir, zp * MM, zq * MM, Rb * MM, passoC), LP = camP.L / MM, pfP = [], qP = [];
        /* o colar só no trecho reto da perna (no joelho curto a ponta chega à curva: lá fica a transição de sempre) */
        pontaPerfil(pfP, cot.ponta, cot);
        if (camP.estacoes.length && cot.ponta + 5 < camP.estacoes[0] / MM) pontaColar(pfP, cot, true, rcJ); else pfP.push([cot.ponta + transicao(cot), rcJ]);
        pfP.push([LP - cot.pb - transicao(cot), rcJ]);
        boca(qP, LP, -1, cot); qP.reverse();
        varrer(m, camP, escala(pfP.concat(qP)), segsDe(lod, de), false);
        anelBorracha(mA, camP, LP, -1, cot, segsDe(lod, de));
        portaPonta(jus, zp, cot.ponta); porta(mon, zq, cot.pb);
      } else {
        var cam = cotovelo(P, a.dir, b.dir, z * MM, z * MM, Rb * MM, lod === "longe" ? Math.PI / 4 : (/^curva/.test(tipo) ? Math.PI / 48 : Math.PI / 8));
        var Lmm = cam.L / MM;
        varrer(m, cam, escala(perfilDuasBocas(Lmm, cot, cot, raioCorpo(cot))), segsDe(lod, de), false);
        anelBorracha(mA, cam, 0, +1, cot, segsDe(lod, de)); anelBorracha(mA, cam, Lmm, -1, cot, segsDe(lod, de));
        porta(a, z, cot.pb); porta(b, z, cot.pb);
      }
    } else if (tipo === "te" || tipo === "te_reducao" || tipo === "juncao" || tipo === "cruzeta") {
      if (eixos.length < 3) return null;
      /* o par MAIS alinhado é a linha (a mesma regra do biminst.decidir) */
      var par = null, best = 1e9, i, j;
      for (i = 0; i < eixos.length; i++) for (j = i + 1; j < eixos.length; j++) { var dv = desvio(eixos[i].dir, eixos[j].dir); if (dv < best) { best = dv; par = [i, j]; } }
      var ra = eixos[par[0]], rb = eixos[par[1]], ramais = eixos.filter(function (_, k) { return k !== par[0] && k !== par[1]; });
      var dnRamal = Math.min.apply(null, ramais.map(function (x) { return x.dn; }));
      cot = cotasConexao(mat, tipo === "cruzeta" ? "te" : tipo, c.dn, tipo === "te_reducao" ? (c.dn2 || dnRamal) : 0, dnRamal);
      var jusR = cot.ponta && cot.zp ? jusante([ra, rb]) : null;
      if (jusR && jusR !== ra) { var tmp = ra; ra = rb; rb = tmp; }   /* ra = a de jusante (a ponta) */
      var ax = nrmz(sub(rb.dir, ra.dir)), za, zb, zc;
      if (jusR) { za = cot.zp; zb = cot.zr; zc = cot.zb; }
      else if (tipo === "juncao") {
        /* ⚠ proporção declarada (a ficha dá só o comprimento da linha): 60 % do lado para onde o ramal aponta (montante),
           40 % do outro; a face do ramal à mesma distância do lado longo */
        var rm = ramais[0], ladoA = dot(rm.dir, ra.dir) > dot(rm.dir, rb.dir);
        za = cot.L * (ladoA ? 0.6 : 0.4); zb = cot.L - za; zc = cot.L * 0.6; cot.aConferir = true; cot.origem.divisao = "proporcao";
      } else { za = zb = cot.zr; zc = cot.zb; }
      var Fa = add(P, mul(ax, -za * MM));
      var cr = cot, segs = segsDe(lod, cot.de, eixos.length);
      var camR = reta(Fa, ax);
      if (jusR) {
        var pfR = [], qR = [], LR = za + zb;
        pontaPerfil(pfR, cot.ponta, cr); pontaColar(pfR, cr); pfR.push([LR - cr.pb - transicao(cr), raioCorpo(cr)]);
        boca(qR, LR, -1, cr); qR.reverse();
        varrer(m, camR, escala(pfR.concat(qR)), segs, false);
        anelBorracha(mA, camR, LR, -1, cr, segs);
        portaPonta(ra, za, cot.ponta); porta(rb, zb, cr.pb);
      } else {
        varrer(m, camR, escala(perfilDuasBocas(za + zb, cr, cr, raioCorpo(cr))), segs, false);
        anelBorracha(mA, camR, 0, +1, cr, segs); anelBorracha(mA, camR, za + zb, -1, cr, segs);
        porta(ra, za, cr.pb); porta(rb, zb, cr.pb);
      }
      ramais.forEach(function (rm2) {
        var cbx = { de: cot.de, od: cot.od, pb: cot.pb, e: cot.e, junta: J };
        if (rm2.dn < c.dn - 0.5) { var cbt = cotasConexao(mat, "luva", rm2.dn); cbx = { de: cbt.de, od: tipo === "te_reducao" && cot.odb ? cot.odb : cbt.od, pb: cbt.pb, e: cbt.e, junta: J }; }
        /* O CORPO DO RAMAL NASCE DO CORPO DA LINHA EM CONCORDÂNCIA (PARIDADE VISUAL, 18/10/2026): na peça de verdade a
           junção é um "Y" moldado — o ramal sai largo da linha e afina até a bolsa (no tê, um colarinho curto); dois
           cilindros que só se cruzam liam como peça montada. Do eixo da linha até onde o ramal deixa a superfície dela
           (rLinha / sen θ), o raio sai alargado e afina em curva de cosseno até o do corpo. Proporção declarada. */
        var rcB = raioCorpo(cbx), q = []; boca(q, zc, -1, cbx); q.reverse();
        var pfr = perfilRamal(tipo, cbx, raioCorpo(cr), len(cross(rm2.dir, ax)), zc);
        var camb = reta(P, rm2.dir);
        varrer(m, camb, escala(pfr.concat(q)), segs, false); anelBorracha(mA, camb, zc, -1, cbx, segs);
        porta(rm2, zc, cbx.pb, true);
      });
    } else if (tipo === "reducao" && eixos.length === 1) {
      /* aparelho com DN diferente do tubo: a redução sai do PONTO do aparelho no eixo do tubo */
      var et = eixos[0], dnA = Math.abs(et.dn - c.dn) < 0.5 ? c.dn2 : c.dn;
      var ct = cotasConexao(mat, "luva", et.dn), ca = cotasConexao(mat, "luva", dnA);
      cot = cotasConexao(mat, J === "anel" ? "reducao" : "luva_reducao", c.dn, c.dn2);
      var L1 = Math.max(cot.L, ct.pb + ca.pb + 6), p1 = [], q1 = [];
      boca(p1, 0, +1, ca); p1.push([ca.pb + transicao(ca), raioCorpo(ca)], [L1 - ct.pb - transicao(ct), raioCorpo(ct)]);
      boca(q1, L1, -1, ct); q1.reverse();
      var cam1 = reta(P, et.dir);
      varrer(m, cam1, escala(p1.concat(q1)), segsDe(lod, Math.max(ct.de, ca.de)), false); anelBorracha(mA, cam1, L1, -1, ct, 12);
      porta(et, L1, ct.pb);
    } else if (tipo === "uniao") {
      /* UNIÃO soldável (PENDÊNCIAS FINAIS, 18/10/2026): as duas bolsas soldáveis nas pontas (as da norma) e a PORCA no meio, com
         o Ø B da ficha; face a face = A da ficha (os tubos param no fundo das bolsas). Os frisos da porca: forma de desenho. */
      if (eixos.length < 2) return null;
      var u1 = eixos[0], u2 = eixos[1];
      cot = cotasConexao(mat, "uniao", c.dn);
      var Lu = Math.max(cot.L, 2 * cot.pb + 4), hu = Lu / 2, rPo = Math.max(cot.odPorca / 2, cot.od / 2 + 1), segU = segsDe(lod, cot.de);
      var camU = reta(add(P, mul(u1.dir, hu * MM)), u2.dir);
      varrer(m, camU, escala(perfilDuasBocas(Lu, cot, cot, raioCorpo(cot))), segU, false);
      /* a porca: do fim da bolsa de um lado ao fim da do outro (o miolo da peça), com os chanfros e as nervuras de aperto */
      var p0 = Math.min(cot.pb * 0.75, hu * 0.8), p1u = Lu - p0, ch = Math.min(2.5, (p1u - p0) * 0.1);
      varrer(m, reta(add(P, mul(u1.dir, (hu - p0) * MM)), u2.dir), escala([[0, 0], [0, rPo - ch], [ch, rPo], [p1u - p0 - ch, rPo], [p1u - p0, rPo - ch], [p1u - p0, 0]]), segU, false);
      if (lod !== "longe") [0.32, 0.68].forEach(function (fr) {   /* nervuras (forma de desenho) */
        varrer(m, reta(add(P, mul(u1.dir, (hu - p0 - fr * (p1u - p0) + 1.2) * MM)), u2.dir), escala([[0, 0], [0, rPo + 1.2], [2.4, rPo + 1.2], [2.4, 0]]), segU, false);
      });
      porta(u1, hu, cot.pb); porta(u2, hu, cot.pb);
    } else if (tipo === "te_inspecao") {
      /* TÊ DE INSPEÇÃO de esgoto (PENDÊNCIAS FINAIS, 18/10/2026): ponta a jusante (dem C), bolsa a montante (E), comprimento
         E + F e a TAMPA de inspeção de lado (Ø A, face a B − C/2 do eixo), como o produto da ficha (pág. 24). A tampa sai no
         meio do corpo (a altura dela não é cotada: forma de desenho, a conferir). Sem nó ponta-bolsa: duas bolsas. */
      if (eixos.length < 2) return null;
      cot = cotasConexao(mat, "te_inspecao", c.dn);
      var jI = cot.ponta != null ? jusante(eixos.slice(0, 2)) : null, ia = jI || eixos[0], ib = ia === eixos[0] ? eixos[1] : eixos[0];
      var LI = Math.max(cot.L, cot.pb + (cot.ponta || cot.pb) + 10), hI = LI / 2, axI = nrmz(sub(ib.dir, ia.dir)), segI = segsDe(lod, cot.de, 3);
      var camI = reta(add(P, mul(ia.dir, hI * MM)), axI);
      if (jI) {
        var pfI = [], qI = [];
        pontaPerfil(pfI, cot.ponta, cot); pontaColar(pfI, cot); pfI.push([LI - cot.pb - transicao(cot), raioCorpo(cot)]);
        boca(qI, LI, -1, cot); qI.reverse();
        varrer(m, camI, escala(pfI.concat(qI)), segI, false);
        anelBorracha(mA, camI, LI, -1, cot, segI);
        portaPonta(ia, hI, cot.ponta); porta(ib, hI, cot.pb);
      } else {
        varrer(m, camI, escala(perfilDuasBocas(LI, cot, cot, raioCorpo(cot))), segI, false);
        anelBorracha(mA, camI, 0, +1, cot, segI); anelBorracha(mA, camI, LI, -1, cot, segI);
        porta(ia, hI, cot.pb); porta(ib, hI, cot.pb);
      }
      /* a tampa: pescoço do corpo até a face (Ø A), a borda da rosca e a tampa com a aba de aperto */
      var ladoI = o.lado ? nrmz(pv(o.lado)) : perp(axI); ladoI = nrmz(sub(ladoI, mul(axI, dot(ladoI, axI)))); if (len(ladoI) < 0.5) ladoI = perp(axI);
      var rT = cot.odTampa / 2, fT = Math.max(cot.faceTampa, raioCorpo(cot) + 6), Cc = add(P, mul(axI, ((cot.ponta || cot.pb) - cot.pb) / 2 * MM));   /* o meio do corpo, entre a ponta e a bolsa */
      varrer(m, reta(Cc, ladoI), escala([[0, 0], [0, rT * 0.82], [fT - 9, rT * 0.82], [fT - 9, rT], [fT - 2, rT], [fT, rT * 0.9], [fT, 0]]), segI, false);
      if (lod !== "longe") caixaM(m, add(Cc, mul(ladoI, (fT + 2) * MM)), [ladoI, axI, cross(ladoI, axI)], [2 * MM, rT * 0.55 * MM, 2.5 * MM]);   /* a aba de aperto da tampa */
    } else if (tipo === "luva" || tipo === "reducao") {
      if (eixos.length < 2) return null;
      var e1 = eixos[0], e2 = eixos[1];
      if (tipo === "luva") {
        cot = cotasConexao(mat, "luva", c.dn);
        /* luva de esgoto com bolsas diferentes (anel × curta, ver o gerador): cada uma do seu lado, a junta no meio das duas */
        var c2 = cot.pb2 && cot.pb2 !== cot.pb ? { de: cot.de, od: cot.od, pb: cot.pb2, e: cot.e, junta: J } : cot, z1 = cot.L * cot.pb / (cot.pb + c2.pb), z2 = cot.L - z1;
        var camL = reta(add(P, mul(e1.dir, z1 * MM)), e2.dir);
        varrer(m, camL, escala(perfilDuasBocas(cot.L, cot, c2, raioCorpo(cot))), segsDe(lod, cot.de), false);
        anelBorracha(mA, camL, 0, +1, cot, segsDe(lod, cot.de)); anelBorracha(mA, camL, cot.L, -1, c2, segsDe(lod, cot.de));
        porta(e1, z1, cot.pb); porta(e2, z2, c2.pb);
      } else if (J === "anel" && (function () { var cc = cotasConexao(mat, "reducao", c.dn, c.dn2); return cc.excentrica; })()) {
        /* REDUÇÃO EXCÊNTRICA (produto): do lado menor a BOLSA, do maior a PONTA (com a luva pela regra das juntas); o lado menor
           se desloca a diferença dos raios para a geratriz SUPERIOR ficar reta (padrão; abaixo). O tubo menor recebe o
           deslocamento na ponta dele (portas[].desloc) e encontra a bolsa. Tubo vertical: concêntrica (sem "baixo"). */
        var gX = e1.dn >= e2.dn ? e1 : e2, pX = gX === e1 ? e2 : e1;
        cot = cotasConexao(mat, "reducao", c.dn, c.dn2);
        var cgX = cotasConexao(mat, "luva", gX.dn), cpX = cotasConexao(mat, "luva", pX.dn), Lx = cot.L, zgX = cot.zg, zqX = cot.zq;
        var cpqX = { de: cpX.de, od: cot.odPeq || cpX.od, pb: Math.min(cpX.pb, zqX - 3), e: cpX.e, junta: J };
        var rGb = cgX.de / 2 + Math.max(1.2, cgX.e * 1.6), rPb = raioCorpo(cpqX), Lp = cot.ponta;
        /* GERATRIZ SUPERIOR reta (o produto e a prática do esgoto por gravidade: as geratrizes de CIMA alinhadas na mudança de
           diâmetro, para não represar a montante) — o lado menor SOBE; "inferior" no trecho de jusante (excentrica) inverte */
        var trX = o.trechos && o.trechos[gX.trecho], sentidoX = trX && trX.excentrica === "inferior" ? -1 : 1;
        var dirP = gX.dir, baixo = sub([0, sentidoX, 0], mul(dirP, dot([0, sentidoX, 0], dirP))), exc = len(baixo) > 0.5;
        baixo = exc ? nrmz(baixo) : [0, 0, 0];
        var dz = (cgX.de - cpX.de) / 2, s1 = cpqX.pb + transicao(cpqX), s2 = Lx - Lp - 6;
        var pfr = []; boca(pfr, 0, +1, cpqX); pfr.push([s1, rPb], [s2, rGb]);
        var qp = [], rT = cgX.de / 2, chP = Math.min(1.5, cgX.e * 0.7), riP = Math.max(rT * 0.6, rT - Math.max(cgX.e, 1.2));
        pfr.push([Lx - Lp - 1.5, rGb + Math.max(0.8, 0.013 * cgX.de)], [Lx - Lp, rGb + Math.max(0.8, 0.013 * cgX.de)], [Lx - Lp + 0.6, rT], [Lx - chP * 3.7, rT], [Lx, rT - chP], [Lx, riP], [Lx - Math.min(Lp * 0.8, 0.5 * cgX.de), 0]);
        var camX = reta(add(P, mul(pX.dir, zqX * MM)), dirP);
        camX.desloc = function (sm) { var sx = sm / MM, f = sx <= s1 ? 1 : (sx >= s2 ? 0 : (s2 - sx) / (s2 - s1)); return mul(baixo, dz * f * MM); };   /* s do perfil já em metros */
        varrer(m, camX, escala(pfr), segsDe(lod, cgX.de), false);
        var camA = reta(add(add(P, mul(pX.dir, zqX * MM)), mul(baixo, dz * MM)), dirP); anelBorracha(mA, camA, 0, +1, cpqX, segsDe(lod, cgX.de));
        portaPonta(gX, zgX, Lp);
        porta(pX, zqX, cpqX.pb);
        if (portas.length) portas[portas.length - 1].desloc = mul(baixo, dz * MM);
      } else {
        var grande = e1.dn >= e2.dn ? e1 : e2, peq = grande === e1 ? e2 : e1;
        cot = cotasConexao(mat, J === "anel" ? "reducao" : "luva_reducao", c.dn, c.dn2);
        if (cot.de2 == null) { var cq = cotasTubo(mat, c.dn2); cot.de2 = cq.de; cot.pb2 = cotasConexao(mat, "luva", c.dn2).pb; cot.od2 = cotasConexao(mat, "luva", c.dn2).od; }
        var cg = { de: cot.de, od: cot.od, pb: cot.pb, e: cot.e, junta: J }, cpq = { de: cot.de2, od: cot.od2, pb: cot.pb2, e: cot.e, junta: J };
        var L2 = Math.max(cot.L, cot.pb + cot.pb2 + 6), zg = Math.max(L2 / 2, cot.pb + 3), zq = Math.max(L2 - zg, cot.pb2 + 3);
        L2 = zg + zq;
        var Fg = add(P, mul(grande.dir, zg * MM));
        var pfx = [], qx = [];
        boca(pfx, 0, +1, cg); pfx.push([cot.pb + transicao(cg), raioCorpo(cg)], [L2 - cot.pb2 - transicao(cpq), raioCorpo(cpq)]);
        boca(qx, L2, -1, cpq); qx.reverse();
        var camQ = reta(Fg, peq.dir);
        varrer(m, camQ, escala(pfx.concat(qx)), segsDe(lod, cot.de), false);
        anelBorracha(mA, camQ, 0, +1, cg, segsDe(lod, cot.de)); anelBorracha(mA, camQ, L2, -1, cpq, segsDe(lod, cot.de));
        porta(grande, zg, cot.pb); porta(peq, zq, cot.pb2);
      }
    } else return null;
    var partesC = [cascaSaida(m)]; if (mA.idx.length) partesC.push(cascaSaida(mA, "anel"));
    return { partes: partesC, portas: portas, cotas: cot, aConferir: !!(cot && cot.aConferir) };
  }

  /* BUCHA de redução encaixada na bolsa de uma peça maior (o biminst deduz "joelho DN maior + redução" no mesmo nó):
     ela ocupa a bolsa grande e recebe o tubo menor. porta = a do ramo menor (com z e pb da bolsa grande, m). */
  function bucha(material, dnG, dnP, P, dir, zFace, lod) {
    var cg = cotasConexao(material, "luva", dnG), cp = cotasConexao(material, "bucha", dnG, dnP), tp = cotasTubo(material, dnP);
    var m = new Malha(), ri = rIn(tp.de), ro = cg.de / 2 * 0.999, sai = 1.2, pbP = Math.min(cp.pb2 || cp.pb, cg.pb * 0.95);
    var rec = Math.min(pbP * 0.85, Math.max(4, 0.55 * tp.de));
    /* perfil do eixo para fora: fundo, parede, face (saliente sai mm), corpo dentro da bolsa grande */
    var pf = [[cg.pb * 0.95, 0], [cg.pb * 0.95, ro], [-sai + 0.6, ro], [-sai, ro - 0.6], [-sai, ri], [-sai + rec, ri], [-sai + rec, 0]];
    pf = pf.map(function (x) { return [zFace - x[0], x[1]]; });   /* s medido do centro do nó, crescendo para fora (a ordem já sai com as faces para fora) */
    varrer(m, reta(pv(P), dir), escala(pf), segsDe(lod, tp.de), false);
    return { partes: [cascaSaida(m)], recuo: (zFace + sai - pbP) * MM, cotas: cp, aConferir: true };
  }

  /* o NÓ inteiro: as conexões deduzidas no mesmo ponto (joelho + redução, tê + redução…) viram UMA peça
     principal + buchas. lista = conexões do biminst.rede() com o mesmo x,y,z; trechosPorId = {id: trecho}.
     Devolve { pecas: [{id, partes, aConferir}], recuos: {"<trecho>:<lado>": m} } */
  function no(lista, trechosPorId, o) {
    o = o || {};
    if (!lista || !lista.length) return null;
    var c0 = lista[0], P = [c0.x, c0.y, c0.z], ramos = [];
    lista.forEach(function (c) { (c.ramos || []).forEach(function (r) { if (ramos.indexOf(r) < 0) ramos.push(r); }); });
    var eixos = eixosDoNo(P, ramos, trechosPorId, o.tol), out = { pecas: [], recuos: {}, bolsas: {} };
    /* a LUVA da ponta (biminst.juntasDaPonta: c.juntaDe) não é a peça principal do nó: ela abraça a ponta da principal */
    var princ = lista.filter(function (c) { return c.tipo !== "reducao" && !c.juntaDe; })[0], reds = lista.filter(function (c) { return c.tipo === "reducao"; });
    var luvas = lista.filter(function (c) { return c.juntaDe != null; });
    function recuo(p) { var k = p.trecho + ":" + p.lado; out.recuos[k] = Math.max(out.recuos[k] || 0, p.recuo); if (p.bolsaAtras != null) out.bolsas[k] = p.bolsaAtras; if (p.desloc) { out.deslocs = out.deslocs || {}; out.deslocs[k] = p.desloc; } }
    var oT = {}; Object.keys(o).forEach(function (k) { oT[k] = o[k]; }); oT.trechos = trechosPorId;   /* a redução excêntrica lê a orientação no trecho */
    if (princ) {
      var g = conexao(princ, eixos, oT);
      if (!g) return null;
      /* a luva da família (luvaEixo) não é da peça principal: vai para a luva da regra das juntas ou sai */
      out.pecas.push({ id: princ.id, partes: g.partes.filter(function (pt) { return pt.luvaEixo == null; }), aConferir: g.aConferir, cotas: g.cotas });
      g.portas.forEach(function (p) {
        var e = eixos.filter(function (x) { return x.trecho === p.trecho && x.lado === p.lado; })[0];
        var red = reds.filter(function (r) { return e && e.dn < princ.dn - 0.5 && Math.abs(r.dn2 - e.dn) < 0.5; })[0];
        var lv = p.ponta != null ? luvas.filter(function (c) { return String(c.juntaDe) === String(p.trecho); })[0] : null;
        /* a peça do PERFIL MEDIDO já traz a luva da família como parte própria (luvaEixo): ela vira a peça da luva */
        var iE = eixos.indexOf(e), pLuva = g.partes.filter(function (pt) { return pt.luvaEixo != null && pt.luvaEixo === iE; });
        if (lv) {   /* PONTA + LUVA (padrão): a luva recebe a ponta e o tubo que segue — sem bolsa do tubo */
          var lg = pLuva.length ? { partes: lv.invertida ? espelharLuva(pLuva, P, p.dir) : pLuva, recuo: p.recuo, cotas: cotasConexao(princ.material, "luva", e ? e.dn : princ.dn), aConferir: false }
            : (p.produto && luvaProduto(princ.material, e ? e.dn : princ.dn, P, p.dir, p.z / MM, o.lod)) || luvaNaPonta(princ.material, e ? e.dn : princ.dn, P, p.dir, p.z / MM, !!lv.invertida, o.lod);
          out.pecas.push({ id: lv.id, partes: lg.partes, aConferir: lg.aConferir, cotas: lg.cotas });
          recuo({ trecho: p.trecho, lado: p.lado, recuo: lg.recuo });
        } else if (red && !(princ.tipo === "te_reducao" && p.ramal)) {
          var bu = bucha(princ.material, princ.dn, e.dn, P, p.dir, p.z / MM, o.lod);
          out.pecas.push({ id: red.id, partes: bu.partes, aConferir: true, cotas: bu.cotas });
          recuo({ trecho: p.trecho, lado: p.lado, recuo: bu.recuo });
        } else recuo(p);
      });
      /* LUVA SEM PERNA DE PONTA NO PERFIL (19/10/2026, "pecinhas quadradas" do Rogério): o biminst deduz a luva pela ficha
         (HidGeo.temPonta) e o perfil medido do DN 40 (joelho/curva/tê/junção) não tem a perna da luva — a conexão saía sem a
         porta de ponta, ninguém desenhava a luva e o 3D punha um BLOCO no lugar dela. Agora a luva de verdade (luvaNaPonta) abraça a
         face da perna do trecho de jusante, e o tubo começa depois dela. Forma com cota a conferir (o perfil não mede esta perna) */
      luvas.forEach(function (lv) {
        if (out.pecas.some(function (q) { return q.id === lv.id; })) return;
        var pj = g.portas.filter(function (x) { return String(x.trecho) === String(lv.juntaDe); })[0]; if (!pj) return;
        var ej = eixos.filter(function (x) { return x.trecho === pj.trecho && x.lado === pj.lado; })[0], dnL = ej ? ej.dn : princ.dn;
        var lg3 = luvaNaPonta(princ.material, dnL, P, pj.dir, pj.z / MM, !!lv.invertida, o.lod);
        out.pecas.push({ id: lv.id, partes: lg3.partes, aConferir: true, cotas: lg3.cotas });
        recuo({ trecho: pj.trecho, lado: pj.lado, recuo: lg3.recuo });
      });
    } else if (reds.length) {
      var g2 = conexao(reds[0], eixos, oT); if (!g2) return null;
      out.pecas.push({ id: reds[0].id, partes: g2.partes, aConferir: g2.aConferir, cotas: g2.cotas });
      g2.portas.forEach(function (p) {
        /* a redução excêntrica entrega PONTA no lado maior: a luva da regra das juntas abraça a ponta */
        var lv2 = p.ponta ? luvas.filter(function (c) { return String(c.juntaDe) === String(p.trecho); })[0] : null;
        if (lv2) { var lg2 = luvaNaPonta(reds[0].material, p.dn, P, p.dir, p.z / MM, !!lv2.invertida, o.lod); out.pecas.push({ id: lv2.id, partes: lg2.partes, aConferir: lg2.aConferir, cotas: lg2.cotas }); recuo({ trecho: p.trecho, lado: p.lado, recuo: lg2.recuo }); }
        else recuo(p);
      });
    }
    return out;
  }

  /* a luva da família INVERTIDA (contra o fluxo): espelhada no plano do meio dela — a bolsa de anel passa para jusante */
  function espelharLuva(partes, P, d) {
    var smin = Infinity, smax = -Infinity, Pv = pv(P);
    partes.forEach(function (pt) { var v = pt.malha.pos; for (var i = 0; i < v.length; i += 3) { var sv = (v[i] - Pv[0]) * d[0] + (v[i + 1] - Pv[1]) * d[1] + (v[i + 2] - Pv[2]) * d[2]; if (sv < smin) smin = sv; if (sv > smax) smax = sv; } });
    var sm = (smin + smax) / 2;
    return partes.map(function (pt) {
      var v = pt.malha.pos, nv = new Array(v.length), ix = pt.malha.idx, ni = new Array(ix.length);
      for (var i = 0; i < v.length; i += 3) { var sv = (v[i] - Pv[0]) * d[0] + (v[i + 1] - Pv[1]) * d[1] + (v[i + 2] - Pv[2]) * d[2], k = 2 * (sv - sm); nv[i] = v[i] - k * d[0]; nv[i + 1] = v[i + 1] - k * d[1]; nv[i + 2] = v[i + 2] - k * d[2]; }
      for (var j = 0; j < ix.length; j += 3) { ni[j] = ix[j]; ni[j + 1] = ix[j + 2]; ni[j + 2] = ix[j + 1]; }   /* espelho inverte a orientação */
      var nr = pt.malha.nrm, nn = nr ? new Array(nr.length) : null;
      if (nr) for (var r = 0; r < nr.length; r += 3) { var dn = nr[r] * d[0] + nr[r + 1] * d[1] + nr[r + 2] * d[2]; nn[r] = nr[r] - 2 * dn * d[0]; nn[r + 1] = nr[r + 1] - 2 * dn * d[1]; nn[r + 2] = nr[r + 2] - 2 * dn * d[2]; }
      var ml = {}; Object.keys(pt.malha).forEach(function (kk) { ml[kk] = pt.malha[kk]; }); ml.pos = nv; ml.idx = ni; if (nn) ml.nrm = nn;
      var q = {}; Object.keys(pt).forEach(function (kk) { q[kk] = pt[kk]; }); q.malha = ml; return q;
    });
  }
  /* a LUVA sobre a ponta de uma conexão de esgoto (QV1, juntas): a luva da ficha tem bolsas diferentes — a de ANEL
     (pb, mais funda) e a curta (pb2). Pelo escoamento, a bolsa de anel RECEBE A PONTA que vem de montante (a conexão) e
     a curta recebe o tubo de jusante; "invertida" troca as duas (contra o fluxo). zp = a ponta (mm do vértice).
     Devolve o recuo do tubo de jusante (m): ele começa no fundo da bolsa de lá. */
  function luvaNaPonta(material, dn, P, dir, zp, invertida, lod) {
    var cl = cotasConexao(material, "luva", dn), J = cl.junta, m = new Malha(), mA = new Malha();
    var cAnel = { de: cl.de, od: cl.od, pb: cl.pb, e: cl.e, junta: J }, cCurta = { de: cl.de, od: cl.od, pb: cl.pb2 || cl.pb, e: cl.e, junta: J };
    var cUp = invertida ? cCurta : cAnel, cDn = invertida ? cAnel : cCurta, L = Math.max(cl.L, cUp.pb + cDn.pb + 2);
    var s0 = zp - cUp.pb, segs = segsDe(lod, cl.de), cam = reta(add(pv(P), mul(dir, s0 * MM)), dir);
    varrer(m, cam, escala(perfilDuasBocas(L, cUp, cDn, raioCorpo(cl))), segs, false);
    anelBorracha(mA, cam, 0, +1, cUp, segs); anelBorracha(mA, cam, L, -1, cDn, segs);
    var partes = [cascaSaida(m)]; if (mA.idx.length) partes.push(cascaSaida(mA, "anel"));
    return { partes: partes, recuo: (s0 + L - cDn.pb) * MM, faceMontante: s0 * MM, faceJusante: (s0 + L) * MM, bolsaMontante: cUp.pb, bolsaJusante: cDn.pb, cotas: cl, aConferir: !!cl.aConferir };
  }
  /* a conexão sai de fábrica com PONTA a jusante? (o biminst usa para deduzir a luva) */
  function temPonta(material, tipo, dn) {
    if (JUNTA[material] !== "anel") return false;
    if (tipo === "reducao") { var PRr = material === "pvc_esgoto" ? produto() : null; return !!(PRr && PRr.reducao && Object.keys(PRr.reducao).some(function (k) { return k.split("x")[0] === String(dn); })); }
    try { return cotasConexao(material, tipo, dn).ponta != null; } catch (e) { return false; }
  }

  /* ============================================================ PEÇAS
   * Caixa sifonada e ralos: corpo, porta-grelha, grelha, entradas e saída.
   * k = peça do biminst (x,y,z = topo no piso, dn "150x185x75"); ligados = [{trecho, dir (do centro
   * para fora, horizontal ou não), dn, ponto (a ponta do tubo na peça)}].
   * As entradas/saída LIGADAS saem na direção e na altura do tubo real (a caixa gira na obra); as que
   * sobram ficam fechadas, no ângulo declarado (o catálogo dá o número e o DN, não o ângulo). */
  function peca(k, ligados, o) {
    o = o || {};
    var tab = (dados().pecas || {})[k.peca] || {}, ct = tab[String(k.dn)], aConf = false, fontes = [];
    var alt, diam, topo, dnS, dnE, nE, hS;
    if (ct) { alt = ct.alt; diam = ct.diam; topo = ct.topo || null; dnS = ct.dnSaida; dnE = ct.dnEntrada || dnS; nE = ct.entradas || 0; hS = ct.hSaida || null; fontes.push(fonte(ct.f, ct.pag)); if (ct.interpretacao) aConf = true; }
    else {
      var ps = String(k.dn || "").split("x").map(Number); if (!(ps[0] > 0)) return null;
      diam = ps[0]; alt = ps.length > 2 ? ps[1] : 100; dnS = ps[ps.length - 1]; dnE = 40; nE = k.peca === "caixa_sifonada" ? 3 : 0; aConf = true;
    }
    var mat = "pvc_esgoto", seg = o.lod === "longe" ? 12 : 24, C = [num(k.x, 0), num(k.y, 0), num(k.z, 0)], Y = [0, 1, 0];
    var m = new Malha(), mb = new Malha(), mg = new Malha(), mA = new Malha(), mF = new Malha(), H = alt, rb = diam / 2, rf = Math.max(rb + 4, (topo || diam) / 2 + 2), hf = 12;
    /* corpo: fundo levemente menor (a caixa é injetada com saída de molde) */
    var base = sub(C, [0, H * MM, 0]);
    /* PARIDADE VISUAL (18/10/2026, bancada contra o modelo do fabricante): a caixa sifonada tem o PORTA-GRELHA
       QUADRADO (a planta já a desenha quadrada) e a grelha de FENDAS paralelas; o ralo tem o corpo CÔNICO (afina para
       a saída) e a grelha redonda de fendas. Antes: corpo cilíndrico e disco de frisos concêntricos nos dois. */
    var ehCx = k.peca === "caixa_sifonada", rot = num(k.rotY, 0), eX = [Math.cos(rot), 0, -Math.sin(rot)], eZ = [Math.sin(rot), 0, Math.cos(rot)];
    var rFundo = ehCx ? rb * 0.94 : rb * 0.78;
    if (ehCx) {
      varrer(m, reta(base, Y), escala([[0, 0], [0, rFundo], [4, rb * 0.97], [H - hf, rb], [H - hf, 0]]), seg, false);
      var Lq = rf;   /* meio lado do porta-grelha */
      caixaM(m, add(base, [0, (H - hf / 2 - 0.75) * MM, 0]), [eX, Y, eZ], [Lq * MM, (hf / 2 - 0.75) * MM, Lq * MM]);
      grelhaFendas(mg, mF, add(base, [0, (H - 1.5) * MM, 0]), eX, eZ, Lq - 7, null, o.lod);
    } else {
      varrer(m, reta(base, Y), escala([[0, 0], [0, rFundo], [4, rFundo + (rb - rFundo) * 4 / Math.max(8, H - hf)], [H - hf, rb], [H - hf, rf], [H - 1, rf], [H, rf - 1], [H, rf - 7], [H - 5, rf - 7], [H - 5, 0]]), seg, false);
      grelhaFendas(mg, mF, add(base, [0, (H - 5) * MM, 0]), eX, eZ, rf - 7.5, rf - 7.5, o.lod);
    }
    /* bocas: as ligadas na direção do tubo; as que faltam, fechadas */
    var portas = [], usadas = [];
    var lig = (ligados || []).map(function (l) { return l; });
    var cs = cotasConexao(mat, "luva", dnS), ce = cotasConexao(mat, "luva", dnE);
    function bocaRadial(dir, h, c, fechada) {
      var dh = nrmz([dir[0], 0, dir[2]]); if (len(dh) < 0.5) return null;
      var y0 = Math.max(c.od / 2 + 2, Math.min(H - hf - c.od / 2 - 2, h));
      var C0 = add(base, [0, y0 * MM, 0]), Lb = rb + c.pb + 8;
      var pf = [[0, 0], [0, raioCorpo(c)], [Lb - c.pb - transicao(c), raioCorpo(c)]], q = [];
      /* entrada LIVRE (rodada 3, 18/10/2026): tubinho liso e curto, ABERTO, com a borda na boca, como a peça de verdade;
         antes era um toco maciço de 10 lados que lia como octógono grande */
      if (fechada) { var rcF = c.de / 2 + Math.max(1.2, c.e), riF = c.de / 2 - Math.max(0.6, c.e * 0.5), Lf = rb + Math.max(10, 0.4 * c.de); Lb = Lf;
        pf = [[Lf - 9, 0], [Lf - 9, riF], [Lf, riF], [Lf, rcF + 0.9], [Lf - 1.6, rcF + 0.9], [Lf - 2.2, rcF], [rb * 0.5, rcF], [rb * 0.5, 0]].reverse(); }
      else { boca(q, Lb, -1, c); q.reverse(); pf = pf.concat(q); }
      var camR = reta(C0, dh);
      varrer(mb, camR, escala(pf), o.lod === "longe" ? 8 : 24, false);
      if (!fechada) anelBorracha(mA, camR, Lb, -1, c, 14);
      return { face: Lb, y: y0, dir: dh };
    }
    lig.forEach(function (l, ix) {
      var d = pv(l.dir), vertical = Math.abs(d[1]) > 0.9, c = l.dn >= dnS - 0.5 && !usadas.some(function (u) { return u === "s"; }) && (l.saida || ix === 0 && lig.length === 1) ? cs : (Math.abs(l.dn - dnS) < 0.5 ? cs : ce);
      if (vertical) {   /* tubo pelo fundo: saída para baixo; por cima: passa pela grelha (traçado), nada a desenhar */
        if (d[1] < 0) { varrer(mb, reta(base, [0, -1, 0]), escala([[0, 0], [0, raioCorpo(c)], [c.pb, raioCorpo(c)]].concat((function () { var q = []; boca(q, c.pb + 8, -1, c); q.reverse(); return q; })())), Math.max(10, seg - 8), false); portas.push({ trecho: l.trecho, lado: l.lado, recuoAbs: add(base, [0, -(8) * MM, 0]) }); }
        return;
      }
      var pt0 = pv(l.ponto), h = (pt0[1] - base[1]) / MM;
      var b = bocaRadial(d, h, c, false); if (!b) return;
      usadas.push(c === cs ? "s" : "e");
      /* a ponta do tubo vai até o fundo da bolsa: distância horizontal (b.face − pb) do eixo da caixa */
      portas.push({ trecho: l.trecho, lado: l.lado, raio: (b.face - c.pb) * MM, centro: C });
    });
    var nLivres = Math.max(0, nE - usadas.filter(function (u) { return u === "e"; }).length);
    var temSaida = usadas.indexOf("s") >= 0 || (lig.some(function (l) { return pv(l.dir)[1] < -0.9; }));
    /* as entradas livres em VOLTA do corpo, em passos iguais a partir da saída (o desenho da caixa de 7 entradas) */
    var angs = [], angS = 0, lS = lig.filter(function (l) { return Math.abs(pv(l.dir)[1]) < 0.9; })[0];
    if (lS) angS = Math.atan2(pv(lS.dir)[2], pv(lS.dir)[0]);
    for (var a = 0; a < nLivres; a++) angs.push(angS + 2 * Math.PI * (a + 1) / (nLivres + 1));
    angs.forEach(function (an) { bocaRadial([Math.cos(an), 0, Math.sin(an)], H - hf - ce.od / 2 - 6, ce, true); });
    if (!temSaida && k.peca === "caixa_sifonada") bocaRadial([1, 0, 0], hS || H * 0.5, cs, true);
    if (hS == null) aConf = true;
    var partesP = [cascaSaida(m), cascaSaida(mb), cascaSaida(mg, "grelha")]; if (mA.idx.length) partesP.push(cascaSaida(mA, "anel"));
    if (mF.idx.length) partesP.push(cascaSaida(mF, "fenda"));
    return { partes: partesP, portas: portas, aConferir: aConf, fontes: fontes, cotas: { alt: alt, diam: diam, dnSaida: dnS, dnEntrada: dnE, entradas: nE, hSaida: hS } };
  }
  /* caixa (paralelepípedo) FECHADA: centro, eixos [ex, ey, ez] (destros, unitários), meias medidas (m) */
  function caixaM(m, C, ax, hs) {
    m.abrir();
    for (var i = 0; i < 3; i++) for (var sgn = -1; sgn <= 1; sgn += 2) {
      var j = (i + 1) % 3, kk = (i + 2) % 3, n = mul(ax[i], sgn), Fc = add(C, mul(n, hs[i])), q = [];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (ab) { q.push(m.v(add(add(Fc, mul(ax[j], ab[0] * hs[j])), mul(ax[kk], ab[1] * hs[kk])), n)); });
      if (sgn > 0) { m.t(q[0], q[1], q[2]); m.t(q[0], q[2], q[3]); } else { m.t(q[0], q[2], q[1]); m.t(q[0], q[3], q[2]); }
    }
    m.fechar();
  }
  /* a GRELHA DE FENDAS: placa fina com barras paralelas por cima (as fendas são o vão entre elas); meia (mm) = meio lado
     da quadrada, ou raio da redonda (raio != null: as barras são cortadas no círculo). F = centro da face de baixo. */
  function grelhaFendas(mg, mF, F, eX, eZ, meia, raio, lod) {
    /* RODADA 3: as FENDAS CURVAS da grelha da peça de verdade (o "S" alongado e inclinado, em fila): a placa e, por cima,
       cada fenda como uma faixa escura em curva (8 trechos), cortada no círculo na grelha redonda. Proporção declarada. */
    var Y = [0, 1, 0], nb = lod === "longe" ? 5 : 9, passo = 2 * meia / (nb + 0.6), wf = Math.max(1.4, passo * 0.24), amp = passo * 0.26;
    if (raio != null) varrer(mg, reta(F, Y), escala([[0, 0], [0, raio], [1.2, raio], [1.2, 0]]), lod === "longe" ? 12 : 32, false);
    else caixaM(mg, add(F, [0, 0.6 * MM, 0]), [eX, Y, eZ], [meia * MM, 0.6 * MM, meia * MM]);
    var nT = lod === "longe" ? 4 : 8;
    for (var b = 0; b < nb; b++) {
      var x0 = -meia + passo * (0.8 + b), hz = raio != null ? Math.sqrt(Math.max(0, raio * raio - x0 * x0)) - 4 : meia - 4;
      if (hz < 4) continue;
      var pts = [];
      for (var k = 0; k <= nT; k++) { var t = -1 + 2 * k / nT; pts.push([x0 + amp * Math.sin(Math.PI * t * 0.85) + 0.25 * passo * t, t * hz * 0.86]); }
      for (var q = 0; q < nT; q++) {
        var a2 = pts[q], b2 = pts[q + 1], dx = b2[0] - a2[0], dz = b2[1] - a2[1], Ls = Math.sqrt(dx * dx + dz * dz); if (Ls < 0.2) continue;
        var ex = nrmz(add(mul(eX, dx / Ls), mul(eZ, dz / Ls))), ez = nrmz(cross(ex, Y)), mid = add(add(F, mul(eX, (a2[0] + b2[0]) / 2 * MM)), mul(eZ, (a2[1] + b2[1]) / 2 * MM));
        caixaM(mF, add(mid, [0, 1.35 * MM, 0]), [ex, Y, ez], [(Ls / 2 + wf * 0.3) * MM, 0.18 * MM, wf / 2 * MM]);
      }
    }
  }
  /* a grelha: disco de baixo para cima, a face de cima com FENDAS concêntricas (frisos de 1,2 mm) — de fora para o eixo */
  function perfilGrelha(gR, H, nfr) {
    var top = H - 2.2, fundo = H - 4.6, p = [[fundo, 0], [fundo, gR], [top, gR]];
    for (var i = nfr; i >= 1; i--) {
      var r1 = gR * i / nfr, r0 = gR * (i - 0.45) / nfr;
      if (i < nfr) p.push([top, r1]);
      p.push([top - 1.2, r1 - 0.4], [top - 1.2, r0 + 0.4], [top, r0]);
    }
    p.push([top, 0]);
    return p;
  }

  /* ========================================================== REGISTRO
   * a = acessório do biminst (centro, dir, comprimento face a face, dn, variante, material).
   * ⚠ Só o face a face vem da família (os conectores dela). Corpo, castelo, canopla e volante são
   *   PROPORÇÃO DECLARADA (aConferir): as fichas de metais não estão transcritas com cotas.
   * frente = para onde o castelo aponta (sai da parede). Sem ela: tubo horizontal → horizontal, perpendicular
   *   ao tubo; tubo vertical → +Z. */

  /* ======================================================== REGISTRO PELA MEDIDA DA FAMÍLIA
   * (pedido da coordenação, 18/10/2026: "cada tipo com a referência certa") — esfera de PVC soldável (aparente), gaveta
   * bruto de latão e pressão com acabamento (embutido) pela família do fabricante da biblioteca do escritório, só os
   * números (dados-fonte/hidro/geometria/produto-registros.json): o CORPO é a revolução do perfil medido no eixo do tubo,
   * o CASTELO a revolução no eixo da haste, os SEXTAVADOS prismas de 6 lados com o canto e a fase medidos e a PLACA
   * (borboleta, chave) o contorno medido extrudado na espessura. O meio dos conectores fica no centro do registro. */
  function triangularPoligono(P) {   /* ear clipping, P = [[u,w]…] no sentido anti-horário → índices */
    var idx = P.map(function (_, i) { return i; }), out = [], g = 0;
    function cruz(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    function dentro(p, a, b, c) { return cruz(a, b, p) >= 0 && cruz(b, c, p) >= 0 && cruz(c, a, p) >= 0; }
    while (idx.length > 3 && g++ < 20000) {
      var cortou = false;
      for (var i = 0; i < idx.length; i++) {
        var ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length], A = P[ia], B = P[ib], C = P[ic];
        if (cruz(A, B, C) <= 1e-12) continue;
        var ok = true; for (var j = 0; j < idx.length && ok; j++) { var k = idx[j]; if (k !== ia && k !== ib && k !== ic && dentro(P[k], A, B, C)) ok = false; }
        if (!ok) continue;
        out.push([ia, ib, ic]); idx.splice(i, 1); cortou = true; break;
      }
      if (!cortou) break;
    }
    if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
    return out;
  }
  /* prisma reto: o polígono (pontos 3D na base, em ordem) extrudado pelo vetor e; faces com normal própria (aresta viva) */
  function prismaPoligono(m, base, e, P2, topoX) {
    var n = base.length; if (n < 3) return;
    var tris = triangularPoligono(P2), topo = topoX || base.map(function (q) { return add(q, e); });
    var nE = nrmz(e), nb = mul(nE, -1);
    m.abrir();
    tris.forEach(function (t) {   /* a base olha para −e, o topo para +e */
      var a = m.v(base[t[0]], nb), b = m.v(base[t[1]], nb), c = m.v(base[t[2]], nb); m.t(a, c, b);
      var a2 = m.v(topo[t[0]], nE), b2 = m.v(topo[t[1]], nE), c2 = m.v(topo[t[2]], nE); m.t(a2, b2, c2);
    });
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n, A = base[i], B = base[j], nl = nrmz(cross(sub(B, A), nE));
      var q0 = m.v(A, nl), q1 = m.v(B, nl), q2 = m.v(topo[j], nl), q3 = m.v(topo[i], nl);
      m.t(q0, q1, q2); m.t(q0, q2, q3);
    }
    m.fechar();
  }
  function registroProduto(a, o, C, d, fr) {
    var PR = produto(), D = PR && PR.registros && PR.registros[a.acessorio + ":" + a.variante], rg = D && D[String(a.dn)];
    if (!rg) return null;
    var zz = cross(d, fr), segs = o.lod === "longe" ? 10 : 32, xm = rg.conectores.length >= 2 ? (rg.conectores[0].x + rg.conectores[1].x) / 2 : 0;
    function W(x, y, z) { return add(C, add(mul(d, (x - xm) * MM), add(mul(fr, y * MM), mul(zz, z * MM)))); }
    var mc = new Malha(), mk = new Malha(), mp = new Malha();
    function revol(m, ext, origem, eixo) {
      if (!ext || ext.length < 2) return;
      var s0 = ext[0][0], L = ext[ext.length - 1][0] - s0, pf = [[0, 0]].concat(ext.map(function (q) { return [q[0] - s0, q[1]]; })).concat([[L, 0]]);
      varrer(m, reta(origem(s0), eixo), escala(pf), segs, false);
    }
    function hexes(m, lista, ponto, eu, ew, eixo) {
      (lista || []).forEach(function (h) {
        var f0 = h.fase * Math.PI / 180, base = [], P2 = [];
        for (var k = 0; k < 6; k++) { var an = f0 + k * Math.PI / 3, cu = Math.cos(an) * h.rc, cw = Math.sin(an) * h.rc; P2.push([cu, cw]); base.push(add(ponto(h.s0), add(mul(eu, cu * MM), mul(ew, cw * MM)))); }
        /* o sentido dos pontos pede a base girando em volta de +eixo (eu × ew = eixo) */
        if (dot(cross(eu, ew), eixo) < 0) { base.reverse(); P2.reverse(); }
        prismaPoligono(m, base, mul(eixo, (h.s1 - h.s0) * MM), P2);
      });
    }
    /* corpo: eixo x (o do tubo); fase medida em volta de x a partir de y (u = y, w = z) */
    var pC = function (s) { return W(s, 0, 0); };
    revol(mc, rg.corpo.ext, pC, d); hexes(mc, rg.corpo.hex, pC, fr, zz, d);
    /* castelo: eixo da haste (+y) em (xc, zc); fase em volta de y a partir de z (u = z, w = x) */
    var cs = rg.castelo || {}, pK = function (s) { return W(cs.xc || 0, s, cs.zc || 0); };
    var mCast = /acabamento/.test(a.variante) ? mk : mc;
    revol(mCast, cs.ext, pK, fr); hexes(mCast, cs.hex, pK, zz, d, fr);
    /* placa (borboleta / chave): o contorno no plano (u, w) e a espessura no eixo da placa */
    (rg.placas || []).forEach(function (pl) {
      if (!pl.contorno || pl.contorno.length < 3) return;
      var ax = pl.eixo, EIX = [d, fr, zz], ua = (ax + 1) % 3, wa = (ax + 2) % 3, P2 = pl.contorno.map(function (q) { return [q[0], q[1]]; });
      var area = 0; for (var i = 0; i < P2.length; i++) { var j = (i + 1) % P2.length; area += P2[i][0] * P2[j][1] - P2[j][0] * P2[i][1]; }
      if (area < 0) P2.reverse();
      /* a espessura por ponto (q[2]..q[3]: a borboleta afina para a ponta); sem ela, a da placa */
      var Q = pl.contorno.map(function (q) { return q; }); if (area < 0) Q.reverse();
      var ponto = function (q, lado) { var c3 = [0, 0, 0]; c3[ax] = q.length > 3 ? q[lado ? 3 : 2] : (lado ? pl.e1 : pl.e0); c3[ua] = q[0]; c3[wa] = q[1]; return W(c3[0], c3[1], c3[2]); };
      var base = Q.map(function (q) { return ponto(q, 0); }), topo = Q.map(function (q) { return ponto(q, 1); });
      if (dot(cross(EIX[ua], EIX[wa]), EIX[ax]) < 0) { base.reverse(); topo.reverse(); P2.reverse(); }
      prismaPoligono(mp, base, mul(EIX[ax], (pl.e1 - pl.e0) * MM), P2, topo);
    });
    var latao = /bruto|acabamento/.test(a.variante), partes = [cascaSaida(mc, latao ? "latao" : "corpo")];
    if (mk.idx.length) partes.push(cascaSaida(mk, "cromado"));
    if (mp.idx.length) partes.push(cascaSaida(mp, latao ? "latao" : "corpo"));
    var Lc = rg.conectores.length >= 2 ? Math.abs(rg.conectores[1].x - rg.conectores[0].x) : 0;
    /* as cotas da peça MEDIDA (corpo = o maior diâmetro no meio; altura = do fundo do corpo ao topo) e, onde a ficha da base
       cota diferente, a divergência registrada (decisão da coordenação: vale a família, que é o produto) */
    var rMeio = 0; (rg.corpo.ext || []).forEach(function (q) { if (Math.abs(q[0] - xm) <= 20) rMeio = Math.max(rMeio, q[1]); });
    var topo = (cs.ext && cs.ext.length) ? cs.ext[cs.ext.length - 1][0] : rMeio;
    (rg.placas || []).forEach(function (pl) { (pl.contorno || []).forEach(function (q) { var yv = pl.eixo === 1 ? (q.length > 3 ? q[3] : pl.e1) : ((pl.eixo + 1) % 3 === 1 ? q[0] : q[1]); if (yv > topo) topo = yv; }); });   /* a borboleta/chave pode passar da haste */
    var cot = { origem: "produto (família medida)", familia: rg.familia, tipo: rg.tipo, faceAFace: Lc, corpo: Math.round(2 * rMeio * 10) / 10, altura: Math.round((topo + rMeio) * 10) / 10, topoHaste: Math.round(topo * 10) / 10, aConferir: false };
    var tabF = ((dados().pecas || {}).registro || {})[a.acessorio === "registro_pressao" ? "registro_pressao" : "registro_gaveta"] || {}, f0 = tabF[String(a.dn)];
    if (f0 && a.acessorio !== "registro_esfera") {
      var dv = [];
      if (f0.corpo && Math.abs(f0.corpo - cot.corpo) >= 0.5) dv.push("corpo ø" + cot.corpo + " (família) × ø" + f0.corpo + " (ficha)");
      if (f0.altura && Math.abs(f0.altura - cot.altura) >= 0.5) dv.push("altura " + cot.altura + " (família) × " + f0.altura + " mm (ficha)");
      if (dv.length) cot.divergencia = dv.join("; ");
    }
    return { partes: partes, frente: fr, aConferir: false, comprimento: Lc * MM, cotas: cot };
  }
  function registro(a, o) {
    o = o || {};
    var C = pv(a.centro), d = nrmz(pv(a.dir)), Lff = num(a.comprimento, 0.06) / MM, de = cotasTubo(a.material || "pvc_soldavel", a.dn).de;
    var fr = o.frente ? nrmz(pv(o.frente)) : null;
    if (!fr || Math.abs(dot(fr, d)) > 0.5) fr = Math.abs(d[1]) > 0.9 ? [0, 0, 1] : nrmz(cross([0, 1, 0], d));
    fr = nrmz(sub(fr, mul(d, dot(fr, d))));
    /* a peça MEDIDA na família do fabricante, quando há (esfera de PVC, gaveta bruto, pressão com acabamento) */
    var rP = o.semProduto ? null : registroProduto(a, o, C, d, fr); if (rP) return rP;
    var latao = /latao|bronze/.test(a.varMaterial || "") || a.variante === "bruto" || a.variante === "acabamento" || a.acessorio === "registro_gaveta" || a.acessorio === "valvula_retencao";
    /* RODADA 3 da bancada (18/10/2026): no tubo PLÁSTICO (PVC soldável, CPVC, PPR) o registro é o de PVC soldável da
       referência: corpo plástico com as bolsas soldáveis nas pontas, porcas sextavadas, castelo de PVC e a haste com a
       chave chata no topo, sem volante. A válvula de gaveta de latão com volante de roda fica para o aço/industrial. */
    /* PENDÊNCIAS FINAIS (18/10/2026, coerência 3D × orçamento): o CORPO segue o TIPO escolhido, não o tubo — o registro de
       BASE DE LATÃO (bruto ou com acabamento: o embutido na parede, SINAPI de latão) sai de latão mesmo no tubo de PVC, com o
       acabamento cromado por cima; o de PVC (esfera/pressão soldável, gaveta de PVC opcional, retenção de PVC) sai de PVC.
       Antes, todo registro no tubo plástico saía de PVC e o orçamento cobrava latão. */
    var matTubo = a.material || "pvc_soldavel", vm = a.varMaterial || ({ bruto: "latao", acabamento: "latao", bronze: "bronze", pe_crivo: "bronze" })[a.variante] || "pvc_soldavel";
    var pvcR = /^pvc/.test(vm) && !/^(aco|inox|cobre)/.test(matTubo);
    if (/^pvc/.test(vm) && /^(aco|inox|cobre)/.test(matTubo)) latao = true;   /* PVC no tubo de metal não casa (pendente no orçamento): o desenho fica o de metal */
    if (pvcR) return registroPvc(a, o, C, d, de, matTubo);
    var seg = o.lod === "longe" ? 8 : 16, mc = new Malha(), mv = new Malha(), mk = new Malha();
    var rHex = de * 0.62 + 4, rBojo = de * 0.78 + 6, h = Lff / 2;
    /* RODADA 2: com a ficha do registro BASE (vista frontal cotada: corpo ø42, altura do fundo do corpo ao topo da haste
       105 na gaveta e 100 na pressão), o bojo e a altura do castelo saem dela; o resto do castelo (degraus e porca) é a
       forma do desenho, em proporção da altura cotada */
    var tab = ((dados().pecas || {}).registro || {})[a.acessorio === "registro_pressao" ? "registro_pressao" : "registro_gaveta"] || {}, rc0 = tab[String(a.dn)] || null;
    if (rc0) { rBojo = rc0.corpo / 2; rHex = Math.min(rBojo * 0.92, Math.max(de / 2 + 3, rHex)); }
    /* corpo no eixo do tubo: sextavados nas pontas, bojo no meio */
    var pfC = [[0, 0], [0, rHex * 0.82], [Math.min(h * 0.32, 10), rHex * 0.82]];
    pfC.push([Math.min(h * 0.32, 10), rBojo * 0.8], [h * 0.65, rBojo], [Lff - h * 0.65, rBojo], [Lff - Math.min(h * 0.32, 10), rBojo * 0.8], [Lff - Math.min(h * 0.32, 10), rHex * 0.82], [Lff, rHex * 0.82], [Lff, 0]);
    varrer(mc, reta(add(C, mul(d, -h * MM)), d), escala(pfC), seg, false);
    var sx = [[0, 0], [0, rHex], [Math.min(h * 0.3, 9), rHex], [Math.min(h * 0.3, 9), 0]];
    varrer(mc, reta(add(C, mul(d, -h * MM)), d), escala(sx), 6, false);
    varrer(mc, reta(add(C, mul(d, (h - Math.min(h * 0.3, 9)) * MM)), d), escala(sx), 6, false);
    /* castelo (perpendicular), porca de aperto sextavada, haste */
    var hc = rc0 ? rc0.altura - rc0.corpo / 2 : de * 1.1 + 22, rc = rc0 ? rBojo * 0.8 : de * 0.42 + 6;
    if (rc0) {   /* castelo da base: pescoço, porca sextavada larga, bucha e a haste estriada até o topo cotado */
      varrer(mc, reta(C, fr), escala([[0, 0], [0, rc], [hc * 0.42, rc], [hc * 0.42, rBojo * 0.95], [hc * 0.56, rBojo * 0.95], [hc * 0.56, rc * 0.62], [hc * 0.7, rc * 0.62], [hc * 0.7, 5.5], [hc, 5.5], [hc, 0]]), seg, false);
      varrer(mc, reta(add(C, mul(fr, hc * 0.42 * MM)), fr), escala([[0, 0], [0, rBojo], [hc * 0.14, rBojo], [hc * 0.14, 0]]), 6, false);
    } else
    varrer(mc, reta(C, fr), escala([[0, 0], [0, rc], [hc * 0.55, rc], [hc * 0.55, rc * 1.18], [hc * 0.75, rc * 1.18], [hc * 0.75, rc * 0.62], [hc, rc * 0.62], [hc, 0]]), seg, false);
    var acab = a.variante === "acabamento";
    if (acab) {
      /* ACABAMENTO DocolBase (Docol, catálogo geral pág. 44 — a mesma ficha do js/hidlouca.js): canopla CÔNICA Ø 58 com 40 de
         altura sobre a face da parede e o VOLANTE Ø 57 por cima. A parede fica na altura da base (castelo) — o acabamento
         cobre o que sai dela. Perfil da saia do volante: forma de desenho. */
      var DB = { canoplaD: 58, canoplaH: 40, volanteD: 57, volanteH: 25 };   /* Docol, catálogo geral pág. 44 */
      var hCan = Math.max(hc * 0.55, hc - DB.canoplaH + 8), rCan = DB.canoplaD / 2;
      varrer(mk, reta(add(C, mul(fr, hCan * MM)), fr), escala([[0, 0], [0, rCan * 0.9], [3, rCan], [8, rCan * 0.97], [DB.canoplaH, rCan * 0.62], [DB.canoplaH + 2, rCan * 0.55], [DB.canoplaH + 2, 0]]), seg + 8, false);
      var rV = DB.volanteD / 2 * 0.98, Cv0 = add(C, mul(fr, (hCan + DB.canoplaH) * MM));
      varrer(mk, reta(Cv0, fr), escala([[0, 0], [0, rV * 0.5], [4, rV * 0.92], [10, rV], [16, rV], [21, rV * 0.9], [24.5, rV * 0.35], [DB.volanteH, 0]]), seg + 8, false);
    } else {   /* volante de roda */
      var Rv = de * 0.75 + 16, Cv = add(C, mul(fr, (hc + 4) * MM));
      toro(mv, Cv, fr, Rv * MM, 2.6 * MM, o.lod === "longe" ? 12 : 24, 8);
      var w1 = perp(fr), w2 = cross(fr, w1);
      [0, 1, 2].forEach(function (k) { var an = k * 2 * Math.PI / 3, u = add(mul(w1, Math.cos(an)), mul(w2, Math.sin(an))); varrer(mv, reta(Cv, u), escala([[0, 0], [0, 2], [Rv, 2], [Rv, 0]]), 8, false); });
      varrer(mv, reta(add(Cv, mul(fr, -6 * MM)), fr), escala([[0, 0], [0, 7], [12, 7], [12, 0]]), 12, false);
    }
    var corpoPapel = latao && !pvcR ? "latao" : "corpo";
    var partes = [cascaSaida(mc, corpoPapel)];
    if (mv.idx.length) partes.push(cascaSaida(mv, latao ? "volante" : "corpo"));
    if (mk.idx.length) partes.push(cascaSaida(mk, "cromado"));
    return { partes: partes, frente: fr, aConferir: true, cotas: rc0 ? { corpo: rc0.corpo, altura: rc0.altura, origem: "catalogo", fonte: fonte(rc0.f, rc0.pag), aConferir: "canopla, volante e degraus do castelo (não cotados na ficha da base)" } : null };
  }

  /* o REGISTRO DE PVC SOLDÁVEL (rodada 3): bolsas soldáveis da ficha do soldável nas pontas, porcas sextavadas, bojo; o
     castelo (base sextavada, colar, coluna, degrau) e a haste com a CHAVE chata; a altura e o bojo da ficha da base
     (registros-base-cotas) quando há; o resto em proporção declarada (aConferir). Com acabamento, a canopla e a cruzeta
     cromadas por cima (a base embutida). */
  function registroPvc(a, o, C, d, de, matTubo) {
    var fr = o.frente ? nrmz(pv(o.frente)) : null;
    if (!fr || Math.abs(dot(fr, d)) > 0.5) fr = Math.abs(d[1]) > 0.9 ? [0, 0, 1] : nrmz(cross([0, 1, 0], d));
    fr = nrmz(sub(fr, mul(d, dot(fr, d))));
    var seg = o.lod === "longe" ? 8 : 20, mc = new Malha(), mk = new Malha();
    var mS = JUNTA[matTubo] === "soldavel" ? matTubo : "pvc_soldavel", cs = cotasConexao(mS, "luva", a.dn);
    var tab = ((dados().pecas || {}).registro || {})[a.acessorio === "registro_pressao" ? "registro_pressao" : "registro_gaveta"] || {}, rc0 = tab[String(a.dn)] || null;
    var rB = rc0 ? rc0.corpo / 2 : cs.od / 2 * 1.2, hc = rc0 ? rc0.altura - rc0.corpo / 2 : de * 1.1 + 22;
    var Lff = num(a.comprimento, 0) > 0 ? num(a.comprimento, 0) / MM : 2 * (cs.pb + 5 + 0.22 * cs.od) + rB * 1.5, h = Lff / 2;   /* o face a face é o da família (os tubos param nele) */
    var Lend = Math.min(cs.pb + 5, Lff * 0.3), nut = Math.min(Math.max(6, 0.22 * cs.od), Lff * 0.1);
    /* as duas pontas: bolsa soldável voltada para fora */
    [1, -1].forEach(function (sg) {
      var Fp = add(C, mul(d, sg * h * MM)), dirIn = mul(d, -sg), pf = [];
      boca(pf, 0, +1, cs); pf.push([cs.pb + transicao(cs), cs.od / 2 * 0.94], [Lend, cs.od / 2 * 0.94], [Lend, 0]);
      varrer(mc, reta(Fp, dirIn), escala(pf), seg, false);
      /* a porca sextavada logo depois da ponta */
      varrer(mc, reta(add(Fp, mul(dirIn, (Lend - 0.5) * MM)), dirIn), escala([[0, 0], [0, cs.od / 2 * 1.12], [nut, cs.od / 2 * 1.12], [nut, 0]]), 6, false);
    });
    /* o bojo no meio */
    var Lb2 = Lff - 2 * (Lend + nut) + 2;
    varrer(mc, reta(add(C, mul(d, -Lb2 / 2 * MM)), d), escala([[0, 0], [0, rB * 0.8], [Lb2 * 0.18, rB], [Lb2 * 0.82, rB], [Lb2, rB * 0.8], [Lb2, 0]]), seg, false);
    /* RETENÇÃO de PVC (pressurização, 18/10/2026): o corpo é o mesmo; no lugar do castelo, a TAMPA sextavada da portinhola */
    if (a.acessorio === "valvula_retencao") {
      varrer(mc, reta(C, fr), escala([[0, 0], [0, rB * 0.75], [rB * 1.25, rB * 0.75], [rB * 1.25, 0]]), 6, false);
      return { partes: [cascaSaida(mc, "corpo")], frente: fr, aConferir: true, comprimento: Lff * MM, cotas: { corpo: rB * 2, altura: rB * 2.25, bolsa: cs.pb, origem: "proporcao", fonte: null, aConferir: "retenção de PVC: tampa em proporção declarada" } };
    }
    /* o castelo e a haste */
    varrer(mc, reta(C, fr), escala([[0, 0], [0, rB * 0.9], [hc * 0.3, rB * 0.9], [hc * 0.3, 0]]), 6, false);   /* a base sextavada */
    varrer(mc, reta(add(C, mul(fr, hc * 0.3 * MM)), fr), escala([[0, 0], [0, rB * 1.05], [hc * 0.03, rB * 1.15], [hc * 0.1, rB * 1.15], [hc * 0.13, rB * 0.95], [hc * 0.13, rB * 0.68],
      [hc * 0.48, rB * 0.68], [hc * 0.51, rB * 0.5], [hc * 0.56, rB * 0.5], [hc * 0.56, rB * 0.3], [hc * 0.6, rB * 0.3], [hc * 0.6, 0]]), seg, false);   /* colar, coluna, degrau e haste */
    var acab = a.variante === "acabamento";
    if (!acab) {   /* a CHAVE chata no topo da haste */
      var w1 = perp(fr), w2 = cross(w1, fr);
      caixaM(mc, add(C, mul(fr, hc * 0.88 * MM)), [w1, fr, w2], [rB * 0.62 * MM, hc * 0.12 * MM, rB * 0.13 * MM]);   /* o topo da chave = o topo cotado da haste */
    } else {   /* canopla e cruzeta cromadas */
      var rCan = de * 0.6 + 22, hCan = hc * 0.6;
      varrer(mk, reta(add(C, mul(fr, hCan * MM)), fr), escala([[0, 0], [0, rCan], [2.5, rCan], [8, rCan * 0.72], [14, rB * 0.6], [14, 0]]), seg + 8, false);
      var Cc = add(C, mul(fr, (hCan + 14) * MM));
      varrer(mk, reta(Cc, fr), escala([[0, 0], [0, 7], [18, 6], [24, 0]]), seg, false);
      var u1 = perp(fr), u2 = cross(fr, u1);
      [u1, mul(u1, -1), u2, mul(u2, -1)].forEach(function (u) { varrer(mk, reta(add(Cc, mul(fr, 14 * MM)), u), escala([[0, 0], [0, 3.2], [17, 3.2], [19, 2.2], [19, 0]]), 8, false); });
    }
    var partes = [cascaSaida(mc, "corpo")]; if (mk.idx.length) partes.push(cascaSaida(mk, "cromado"));
    return { partes: partes, frente: fr, aConferir: true, comprimento: Lff * MM,
             cotas: { corpo: rB * 2, altura: hc + rB, bolsa: cs.pb, origem: rc0 ? "catalogo" : "proporcao", fonte: rc0 ? fonte(rc0.f, rc0.pag) : null, aConferir: "castelo, porcas e chave em proporção declarada" } };
  }

  /* ====================================== PEÇAS SÓ DE API (traçado e louças usam)
   * cap, adaptador soldável curto, joelho 90 com bucha de latão (ponto de água azul), luva de correr,
   * TIL. Recebem o ponto da face e a direção para DENTRO da peça. */
  function pecaSimples(tipo, material, dn, F, dir, o) {
    o = o || {};
    var d = nrmz(pv(dir)), Fv = pv(F), m = new Malha(), mk = new Malha(), cot, seg = segsDe(o.lod, 20), parts = [];
    if (tipo === "cap") {
      cot = cotasConexao(material, "cap", dn); var p = [], L = cot.L;
      boca(p, 0, +1, cot); p.push([L - 3, cot.od / 2 * 0.975], [L, cot.od / 2 * 0.8], [L, 0]);
      varrer(m, reta(Fv, d), escala(p), segsDe(o.lod, cot.de), false); parts.push(cascaSaida(m));
    } else if (tipo === "luva_correr") {
      cot = cotasConexao(material, "luva_correr", dn);
      varrer(m, reta(Fv, d), escala(perfilDuasBocas(cot.L, cot, cot, cot.od / 2 * 0.96)), segsDe(o.lod, cot.de), false); parts.push(cascaSaida(m));
    } else if (tipo === "adaptador" || tipo === "joelho_bucha") {
      var C = (dados().conexoes || {})[material] || {}, k = Object.keys(C[tipo] || {}).filter(function (x) { return x.split("x")[0] === String(dn); })[0];
      var reg = k ? C[tipo][k] : null, base0 = cotasConexao(material, "luva", dn);
      cot = { de: base0.de, e: base0.e, pb: base0.pb, od: reg ? reg.od : base0.od, junta: "soldavel", origem: { od: reg ? "catalogo" : "proporcao" }, aConferir: !reg, rosca: reg ? reg.rosca : null };
      if (tipo === "adaptador") {
        var La = reg ? reg.L : base0.pb * 2 + 6, q = [];
        boca(q, 0, +1, cot); q.push([cot.pb + 2, cot.od / 2 * 0.975], [cot.pb + 2, cot.od / 2 * 1.08], [cot.pb + 8, cot.od / 2 * 1.08], [cot.pb + 8, cot.de / 2 * 0.98], [La, cot.de / 2 * 0.98], [La, 0]);
        varrer(m, reta(Fv, d), escala(q), seg, false); parts.push(cascaSaida(m));
      } else if (perfilProduto(material, "joelho_bucha", dn) && !o.semPerfil) {
        /* PARIDADE (18/10/2026): o joelho azul pelo PERFIL MEDIDO (a família do fabricante: a perna 2 é a da rosca ½"); a
           face da boca soldável fica em F, como antes; a bucha de latão no fundo da boca de rosca */
        var ppA = perfilProduto(material, "joelho_bucha", dn), pS = ppA.pernas.filter(function (x) { return String(x.id) !== "2"; })[0] || ppA.pernas[0], pR2 = ppA.pernas.filter(function (x) { return String(x.id) === "2"; })[0] || ppA.pernas[1];
        var upA = o.saida ? nrmz(pv(o.saida)) : perp(d), VA = add(Fv, mul(d, pS.face * MM));
        var gA = conexaoProduto({ tipo: "joelho_bucha", material: material, dn: dn, x: VA[0], y: VA[1], z: VA[2] },
          [{ trecho: "r", lado: 0, dir: upA, dn: pR2.dn }, { trecho: "s", lado: 1, dir: mul(d, -1), dn: dn }], { lod: o.lod, pernaJus: pR2.id }, ppA);
        if (gA) {
          var FA = add(VA, mul(upA, pR2.face * MM)), deR = cotasTubo(material, pR2.dn).de, riA = rIn(deR, "soldavel"), recA = Math.min((pR2.face - pR2.conector) * 0.85, Math.max(4, 0.55 * deR));
          var rBA = Math.min(riA - 2, (reg && reg.rosca === "3/4" ? 26.4 : 20.9) / 2 * 0.86);
          varrer(mk, reta(FA, mul(upA, -1)), escala([[recA - 5, rBA], [recA - 5, riA - 0.12], [recA - 0.3, riA - 0.12], [recA - 0.3, rBA]]), seg, true);
          parts.push({ papel: "azul", malha: gA.partes[0].malha }); parts.push(cascaSaida(mk, "latao"));
          cot.aConferir = false; cot.origem.od = "produto (perfil medido)"; cot.perfilMedido = ppA.familia;
        } else return pecaSimples(tipo, material, dn, F, dir, Object.assign({}, o, { semPerfil: true }));
      } else {   /* joelho azul: a MESMA silhueta do joelho soldável (as duas bocas iguais, curva curta) e a BUCHA DE LATÃO no
                    FUNDO da boca de rosca (rodada 3 da bancada, 18/10/2026: antes um anel dourado grande no topo e a boca
                    afinada mudavam a forma da peça) */
        var z = reg ? reg.z : PROP.z90(cot.de, cot.pb), zr = reg ? Math.max(reg.zr, z) : z, up = o.saida ? nrmz(pv(o.saida)) : perp(d);
        var V0 = add(Fv, mul(d, z * MM));
        var cam = cotovelo(V0, mul(d, -1), up, z * MM, zr * MM, cot.od / 2 * 0.8 * MM);
        varrer(m, cam, escala(perfilDuasBocas(cam.L / MM, cot, cot, cot.od / 2 * 0.94)), seg, false);
        var F2 = add(V0, mul(up, zr * MM)), riS = rIn(cot.de, "soldavel"), recS = Math.min(cot.pb * 0.85, Math.max(4, 0.55 * cot.de));
        var rBi = Math.min(riS - 2, (reg && reg.rosca === "3/4" ? 26.4 : 20.9) / 2 * 0.86);
        varrer(mk, reta(F2, mul(up, -1)), escala([[recS - 5, rBi], [recS - 5, riS - 0.12], [recS - 0.3, riS - 0.12], [recS - 0.3, rBi]]), seg, true);
        parts.push(cascaSaida(m, "azul")); parts.push(cascaSaida(mk, "latao"));
      }
    } else if (tipo === "til") {   /* tubo de inspeção e limpeza (rede enterrada): corpo, entrada, saída e haste de inspeção — proporção declarada */
      cot = cotasConexao(material, "luva", dn); var Lt = cot.de * 3;
      varrer(m, reta(Fv, d), escala(perfilDuasBocas(Lt, cot, cot, raioCorpo(cot))), seg, false);
      var Ct = add(Fv, mul(d, Lt / 2 * MM));
      var hv = [[0, 0], [0, raioCorpo(cot)]], qv = []; boca(qv, cot.de * 2.2, -1, cot); qv.reverse();
      hv.push([cot.de * 2.2 - cot.pb - transicao(cot), raioCorpo(cot)]);
      varrer(m, reta(Ct, [0, 1, 0]), escala(hv.concat(qv)), seg, false); parts.push(cascaSaida(m));
      cot.aConferir = true;
    } else return null;
    return { partes: parts, cotas: cot, aConferir: !!(cot && cot.aConferir) };
  }

  /* marcador DISCRETO de problema (ponta solta, ponto sem tubo): anel fino em volta da ponta. Só a tela decide
     quando mostrar (a vista "problemas" ligada). */
  function marcador(P, dir, raioTubo, o) {
    var m = new Malha(), d = dir ? nrmz(pv(dir)) : [0, 1, 0]; if (len(d) < 0.5) d = [0, 1, 0];
    var R = Math.max(0.01, raioTubo * 1.25 + 0.005);
    toro(m, pv(P), d, R, Math.max(0.0018, R * 0.09), (o && o.lod === "longe") ? 12 : 20, 6);
    return { partes: [cascaSaida(m, "marcador")] };
  }

  var HidGeo = {
    cache: { get ligado() { return CACHE.ligado; }, set ligado(v) { CACHE.ligado = !!v; }, get acertos() { return CACHE.acertos; }, get faltas() { return CACHE.faltas; },
             get tamanho() { return CACHE.m.size; }, limpar: function () { CACHE.m.clear(); CACHE.acertos = 0; CACHE.faltas = 0; } },
    VERSAO: 1, PROP: PROP, JUNTA: JUNTA, APAR: APAR, PAPEL: PAPEL, FOLGA: FOLGA,
    Malha: Malha, varrer: varrer, reta: reta, cotovelo: cotovelo, toro: toro, caixaM: caixaM,   /* caixaM: a caixa de inspeção de alvenaria (js/hidcigeo.js) */
    cotasTubo: cotasTubo, cotasConexao: cotasConexao, aparencia: aparencia,
    tubo: tubo, eixosDoNo: eixosDoNo, conexao: conexao, conexaoProduto: conexaoProduto, perfilProduto: perfilProduto, luvaProduto: luvaProduto, bucha: bucha, no: no, luvaNaPonta: luvaNaPonta, temPonta: temPonta, peca: peca, registro: registro, pecaSimples: pecaSimples, marcador: marcador, perfilRamal: perfilRamal,
    TETO_CONEXAO: 2000, TETO_CONEXAO_GRANDE: 2800, tetoConexao: tetoConexao, TETO_PRODUTO: 3200, TETO_PRODUTO_GRANDE: 4800, TETO_ANEL: 200, TETO_TUBO: 400, TETO_PECA: 4200, TETO_REGISTRO: 2600
  };
  global.HidGeo = HidGeo;
  if (typeof module !== "undefined" && module.exports) module.exports = HidGeo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

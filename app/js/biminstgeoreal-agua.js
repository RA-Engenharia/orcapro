/* =====================================================================
 * biminstgeoreal-agua.js (HidGeoRealAgua) — as CONEXÕES DE ÁGUA FRIA com a volumetria do produto de loja
 * (motor puro, Node-testável; sem three.js).
 *
 * Pedido do Rogério (06/11/2026): "melhore todas as famílias do hidrossanitário, esgoto e água fria; todas as conexões,
 * o mais real possível, 99,9 % de aproximação; pode colocar o logo e a marcação do fabricante". Esta frente é a ÁGUA FRIA:
 * PVC soldável marrom (joelho 90/45, curva 90/45, tê, tê de redução, cruzeta, luva, luva de correr, luva de redução, bucha
 * curta/longa, cap, adaptador curto, adaptador de caixa d'água, união, curva de transposição, joelho 90 de redução,
 * joelho/luva/tê com rosca) e a azul com bucha de latão (joelho, luva, tê).
 *
 * COMO: a peça é refeita aqui com a volumetria do produto — a boca soldável com o ANEL DE REFORÇO, o corpo da bolsa, o
 * corpo central mais fino, os chanfros, a PAREDE com o furo e o BATENTE interno onde o tubo para; a rosca fêmea com os
 * FILETES; a bucha de LATÃO aparente e rosqueada; a rosca macho do adaptador; a flange, a porca e o anel de vedação do
 * adaptador de caixa d'água; a porca da união. ⚠ AS PORTAS NÃO MUDAM: a posição de cada boca (face e profundidade da bolsa,
 * onde o tubo para) vem da construção de sempre (js/biminstgeo.js conexaoBruta / pecaSimples, chamada aqui com
 * o.semReal); só a forma é trocada. Peça que a construção de sempre não desenhava (joelho/luva com rosca, bucha) sai sem
 * porta — o tubo continua como era.
 *
 * DE ONDE VEM CADA COTA (fica na saída, cotas.real):
 *   "ficha"      — Amanco Wavin, FT Água Fria Soldável FTC000001 rev. Out/2025 (letras lidas no desenho; tabela COTAS);
 *   "construção" — a face/bolsa/externo que a peça já tinha (ficha, norma ou perfil medido — js/biminstgeo.js);
 *   "fabricante" — PROPORÇÃO de detalhe tirada dos PARÂMETROS (cotas, não malha) da família do fabricante da Biblioteca do
 *                  escritório (tools/gerar-hid-real-agua-tigre.js): anel de reforço, corpo da bolsa, corpo central,
 *                  chanfros, raio central, furo — escalados pelo Ø da boca da ficha;
 *   "norma"      — a rosca BSP (ABNT NBR 8133 / ISO 7-1: Ø maior e passo por designação);
 *   "desenho"    — o que nenhuma fonte cota (porca e anel do adaptador de caixa, a flange do adaptador curto): forma de
 *                  desenho declarada, a conferir.
 * O que falta fica PENDENTE (cotas.pendente), nunca inventado.
 *
 * MARCAÇÃO DO FABRICANTE: com o.marcacao (ícone, bancada, livro) a peça leva a gravação (nome, DN, norma) como uma faixa
 * sobre o corpo — parte { papel: "marcacao", decal: { texto } } com uv; o 3D do modelo não a desenha (custo e leitura).
 * ===================================================================== */
(function (global) {
  "use strict";
  var MM = 0.001;

  /* ------------------------------------------------ COTAS DA FICHA (Amanco FTC000001, rev. Out/2025) — o que js/biminstgeodados.js
     ainda não traz. Letras lidas no desenho (RA-Build/hidro-familias-real/desenhos/af_*): */
  var COTAS = {
    /* pág. 20 — A = vértice → face da bolsa soldável; B = Ø externo da bolsa; C = vértice → face da boca de rosca (fêmea) */
    joelho_rosca: { pag: 20, leitura: "A vértice→face soldável; B Ø externo; C vértice→face da rosca", dns: { "20x1/2": { A: 27.5, B: 28, C: 26 }, "25x1/2": { A: 29, B: 34, C: 27.7 }, "25x3/4": { A: 36.5, B: 34, C: 34.3 }, "32x3/4": { A: 36.5, B: 43, C: 33.6 } } },
    /* pág. 24 — A = comprimento total; B = Ø externo; bolsa soldável de um lado, rosca fêmea do outro */
    luva_rosca: { pag: 24, leitura: "A comprimento total; B Ø externo", dns: { "20x1/2": { A: 35, B: 30 }, "25x1/2": { A: 37.5, B: 36.5 }, "25x3/4": { A: 35, B: 32 }, "32x1": { A: 43, B: 40.5 }, "40x1 1/4": { A: 49, B: 54 }, "50x1 1/2": { A: 65, B: 60.5 } } },
    /* pág. 24 — idem, azul com bucha de latão */
    luva_bucha: { pag: 24, leitura: "A comprimento total; B Ø externo", dns: { "20x1/2": { A: 32.5, B: 30 }, "25x1/2": { A: 35, B: 38 }, "25x3/4": { A: 35, B: 32.2 }, "32x1": { A: 43, B: 44 } } },
    /* págs. 27 (rosca) e 28 (bucha) — A = linha face a face; B = Ø externo da bolsa da linha; C = da geratriz de baixo da linha
       à face do ramal → face do ramal = C − B/2 */
    te_rosca: { pag: 27, leitura: "A linha face a face; B Ø externo da linha; C base da linha→face do ramal", dns: { "20x1/2": { A: 55, B: 26, C: 40 }, "25x1/2": { A: 60, B: 34, C: 45.3 }, "25x3/4": { A: 66, B: 34, C: 45.8 }, "32x3/4": { A: 73, B: 43, C: 55.8 } } },
    te_bucha: { pag: 28, leitura: "A linha face a face; B Ø externo da linha; C base da linha→face do ramal", dns: { "20x1/2": { A: 55, B: 26, C: 40 }, "25x1/2": { A: 60, B: 34, C: 45.3 }, "25x3/4": { A: 66, B: 34, C: 45.8 } } },
    /* pág. 19 — A = vértice → face da boca MENOR (d); C = vértice → face da boca MAIOR (D); B = Ø externo da bolsa maior */
    joelho90_reducao: { pag: 19, leitura: "A vértice→face menor; C vértice→face maior; B Ø externo maior", dns: { "25x20": { A: 30, B: 34, C: 30 }, "32x25": { A: 36, B: 43, C: 36 } } },
    /* pág. 12 — A = comprimento total; B = Ø externo da bolsa menor (D); P = Ø da PONTA (o DE maior) */
    bucha_longa: { pag: 12, leitura: "A comprimento total; B Ø externo da bolsa menor; P Ø da ponta", dns: { "32x20": { A: 41, B: 28 }, "40x20": { A: 48.7, B: 28 }, "40x25": { A: 49.6, B: 28 }, "50x20": { A: 58, B: 28 }, "50x25": { A: 58.7, B: 34 }, "50x32": { A: 59.5, B: 43 }, "60x25": { A: 67.3, B: 34 }, "60x32": { A: 68.2, B: 43 } } },
    /* pág. 9 — A = comprimento total; B = Ø da flange; C/D = DN; R = rosca (até 60: flange e anel de vedação; 75+: flanges livres) */
    adaptador_caixa: { pag: 9, leitura: "A comprimento total; B Ø da flange; D DN; R rosca", dns: { "20x1/2": { A: 61, B: 64.6 }, "25x3/4": { A: 62, B: 70.7 }, "32x1": { A: 64, B: 79.7 }, "40x1 1/4": { A: 64, B: 100 }, "50x1 1/2": { A: 67, B: 96.7 }, "60x2": { A: 79.8, B: 110.7 }, "75x2 1/2": { A: 94, B: 170 }, "85x3": { A: 100, B: 190 }, "110x4": { A: 120, B: 215 } } }
  };
  var FONTE_FICHA = "Amanco Wavin — FT Água Fria Soldável (FTC000001, rev. Out/2025)";

  /* ------------------------------------------------ PROPORÇÕES DO FABRICANTE (parâmetros das famílias da Biblioteca do escritório;
     tools/gerar-hid-real-agua-tigre.js — números, não malha). rA anel de reforço, rB corpo da bolsa, rC corpo central, wA
     comprimento do anel, ch1 chanfro anel→bolsa, ch2 chanfro da boca, rc raio central do joelho, furo raio interno. */
  var FAB = {"joelho":{"20":{"rA":14.3,"rB":12.4,"rC":11.55,"wA":3.5,"ch1":1.8,"ch2":0.9,"rc":11.8,"furo":8.5},"25":{"rA":16.5,"rB":15.1,"rC":14.04,"wA":4,"ch1":1.4,"ch2":1.1,"rc":14.3,"furo":10.8},"32":{"rA":21.5,"rB":19,"rC":18,"wA":6,"ch1":2.5,"ch2":1.3,"rc":18.2,"furo":13.9},"40":{"rA":26,"rB":23.2,"rC":21.65,"wA":7,"ch1":2.8,"ch2":1.6,"rc":21.9,"furo":17.6},"50":{"rA":30.75,"rB":28.65,"rC":27.15,"wA":7.5,"ch1":3,"ch2":1.7,"rc":27.4,"furo":22},"60":{"rA":38,"rB":34.3,"rC":32.15,"wA":8,"ch1":3.7,"ch2":2.2,"rc":32.4,"furo":26.7},"75":{"rA":43,"rB":40,"rC":35,"wA":8.3,"ch1":4,"ch2":2.5,"rc":35.2,"furo":33.3},"85":{"rA":48,"rB":45,"rC":41,"wA":8.7,"ch1":4.45,"ch2":2.6,"rc":41.3,"furo":37.8},"110":{"rA":61.1,"rB":58,"rC":55,"wA":9,"ch1":6.1,"ch2":2.7,"rc":55.5,"furo":48.9}},
             "uniao":{"20":{"L":46,"porcaL":18.5,"ch":3.25,"rC":13.1,"rPorca":20.3},"25":{"L":51,"porcaL":20.5,"ch":3.6,"rC":17.5,"rPorca":25.2},"32":{"L":55,"porcaL":23.5,"ch":4,"rC":20.2,"rPorca":29.3},"40":{"L":58,"porcaL":28,"ch":6,"rC":24.5,"rPorca":34.9},"50":{"L":68,"porcaL":30,"ch":7,"rC":30.7,"rPorca":44.2},"60":{"L":78,"porcaL":32.5,"ch":7.5,"rC":36.5,"rPorca":51.5},"75":{"L":94,"porcaL":43.5,"ch":9,"rC":46.4,"rPorca":67.9},"85":{"L":109,"porcaL":45,"ch":10.4,"rC":53.7,"rPorca":77.6},"110":{"L":150,"porcaL":48,"ch":12,"rC":69.6,"rPorca":92.1}},
             "correr":{"20":{"anel":10.7},"25":{"anel":12.5},"32":{"anel":13.1},"40":{"anel":18.05},"50":{"anel":19},"60":{"anel":20}}};
  var FONTE_FAB = "parâmetros da família do fabricante (Biblioteca do escritório; proporção de detalhe, não malha)";

  /* ------------------------------------------------ ROSCA BSP (ABNT NBR 8133 / ISO 7-1): Ø maior no plano de referência e passo */
  var BSP = { "1/2": [20.955, 1.814], "3/4": [26.441, 1.814], "1": [33.249, 2.309], "1 1/4": [41.910, 2.309], "1 1/2": [47.803, 2.309], "2": [59.614, 2.309], "2 1/2": [75.184, 2.309], "3": [87.884, 2.309], "4": [113.030, 2.309] };
  function normRosca(r) { return String(r || "").replace(/[”"″]/g, "").replace(/\./g, " ").replace(/\s+/g, " ").trim(); }
  function rosca(r) { var b = BSP[normRosca(r)]; return b ? { D: b[0], p: b[1], h: 0.640327 * b[1], nome: normRosca(r) } : null; }
  /* a rosca padrão de cada DN quando a chave não diz (a da peça mais vendida da ficha) */
  var ROSCA_DN = { 20: "1/2", 25: "3/4", 32: "1", 40: "1 1/4", 50: "1 1/2", 60: "2", 75: "2 1/2", 85: "3", 110: "4" };

  function fab(dn) { var T = FAB.joelho, k = String(dn); if (T[k]) return T[k]; var ks = Object.keys(T).map(Number).sort(function (a, b) { return Math.abs(a - dn) - Math.abs(b - dn); }); return T[String(ks[0])]; }
  /* a BOCA soldável: o Ø da boca é o da construção (ficha/perfil); o resto, a proporção do fabricante no mesmo DN */
  function bocaDe(G, dn, od) {
    var f = fab(dn), de = G.cotasTubo("pvc_soldavel", dn).de, rA = od / 2, k = rA / f.rA;
    var rIn = de / 2 * G.FOLGA;
    var rB = Math.max(rIn + 0.9, Math.min(rA - 0.25, f.rB * k)), rC = Math.max(rIn + 0.6, Math.min(rB, f.rC * k));
    return { dn: dn, de: de, rA: rA, rB: rB, rC: rC, wA: f.wA, ch1: Math.max(0.6, Math.min(f.ch1, (rA - rB) * 2.2)), ch2: Math.min(0.6, f.ch2 * 0.5), rIn: rIn, furo: Math.min(f.furo, rIn - 0.8), rc: f.rc * k };
  }

  /* ------------------------------------------------ perfis de UMA perna (u = distância da FACE para dentro, mm) */
  function zigue(u0, u1, rA, rB, p) {   /* filetes: dente de 60° (triângulo) entre rA (crista) e rB (raiz), passo p */
    var pts = [], n = Math.max(1, Math.floor((u1 - u0) / p));
    for (var k = 0; k <= 2 * n; k++) pts.push([u0 + k * p / 2, k % 2 ? rB : rA]);
    return pts;
  }
  /* externo: [u, r] da face até o corpo */
  function pernaExt(pe, lod) {
    var b = pe.b, o = [];
    if (pe.tipo === "roscaM") {   /* rosca macho do adaptador: filetes até Lr, depois o colar */
      var rs = pe.rosca, rM = rs.D / 2, rm = rM - rs.h;
      o.push([0, rm]);
      if (lod === "longe") o.push([pe.Lr, rM - rs.h * 0.4]); else o = o.concat(zigue(0.6, pe.Lr - 0.3, rm + rs.h * 0.15, rM, rs.p));
      o.push([pe.Lr, rM - rs.h * 0.5]);
      return o;
    }
    if (pe.tipo === "ponta") { var r = pe.de / 2, ch = Math.min(1.2, pe.e * 0.6); return [[0, r - ch], [ch * 2.5, r], [pe.Lp, r]]; }
    if (pe.extP) return pe.extP;   /* o externo MEDIDO do produto (perfil da construção, DN 20–32): igual ao de antes */
    o.push([0, b.rA - b.ch2], [b.ch2, b.rA], [b.wA, b.rA], [b.wA + b.ch1, b.rB]);
    var fimB = Math.max(b.wA + b.ch1 + 0.5, pe.pb - 0.2);
    o.push([fimB, b.rB]);
    if (b.rB - b.rC > 0.05) o.push([fimB + Math.max(0.8, 1.2 * (b.rB - b.rC)), b.rC]);
    return o;
  }
  /* interno: [u, r] da face até o furo */
  function pernaInt(pe, lod) {
    var b = pe.b, chi = Math.min(0.6, b.rIn * 0.04);
    if (pe.tipo === "roscaM") return [[0, pe.furo], [pe.Lr, pe.furo]];
    if (pe.tipo === "ponta") return [[0, pe.de / 2 - pe.e], [pe.Lp, pe.de / 2 - pe.e]];
    if (pe.tipo === "roscaF") {
      var rs = pe.rosca, rM = rs.D / 2, rm = rM - rs.h, Lr = Math.min(pe.pb, pe.Lr || pe.pb);
      var q = [[0, rM + 0.3]];
      if (lod === "longe") q.push([Lr, rm + rs.h * 0.3]); else q = q.concat(zigue(0.5, Lr - 0.2, rm, rM, rs.p));
      q.push([Lr, rm], [Lr, b.furo]);
      return q;
    }
    if (pe.tipo === "latao") return [[0, pe.rL], [pe.Lr, pe.rL], [pe.Lr, b.furo]];
    var q2 = [[0, b.rIn + chi], [chi, b.rIn], [pe.pb, b.rIn], [pe.pb, b.furo]];
    if (pe.anelBorracha) q2.splice(2, 0, [pe.anelBorracha[0], b.rIn], [pe.anelBorracha[0], b.rIn + pe.anelBorracha[2]], [pe.anelBorracha[1], b.rIn + pe.anelBorracha[2]], [pe.anelBorracha[1], b.rIn]);
    return q2;
  }
  function rEm(lista, u) {   /* raio da lista no ponto u (linear; constante depois da última) */
    if (u <= lista[0][0]) return lista[0][1];
    for (var i = 1; i < lista.length; i++) if (u <= lista[i][0]) { var a = lista[i - 1], b = lista[i], t = b[0] - a[0] < 1e-9 ? 1 : (u - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * t; }
    return lista[lista.length - 1][1];
  }
  /* corta a perna em u = uS (o meio da peça) */
  function ate(lista, uS) { var o = lista.filter(function (q) { return q[0] < uS - 1e-6; }); o.push([uS, rEm(lista, uS)]); return o; }
  /* duas pernas num caminho de comprimento L (s = 0 na face 1, s = L na face 2), divididas em sMid: o perfil em s crescente */
  function juntar2(l1, l2, L, sMid) {
    var a = ate(l1, sMid), b = ate(l2, L - sMid).map(function (q) { return [L - q[0], q[1]]; }).reverse();
    if (Math.abs(a[a.length - 1][1] - b[0][1]) < 1e-6) b.shift();
    return a.concat(b);
  }
  /* o laço fechado da varredura: externo em s crescente, interno de volta */
  function laco(ext, int) { return ext.concat(int.slice().reverse()); }
  function escala(p) { return p.map(function (x) { return [x[0] * MM, x[1] * MM]; }); }

  /* ------------------------------------------------ prisma de N faces (sextavado, porca, flange) com faces chapadas e chanfro nas pontas */
  function prisma(G, m, C, d, L, R, n, ch, fase) {
    var u = perpDe(d), w = cross(d, u), aneis = [[0, R - ch], [ch, R], [L - ch, R], [L, R - ch]], th0 = fase || 0;
    function pt(s, r, k) { var a = th0 + 2 * Math.PI * k / n, rr = r / Math.cos(Math.PI / n); return add(add(C, mul(d, s * MM)), add(mul(u, Math.cos(a) * rr * MM), mul(w, Math.sin(a) * rr * MM))); }
    m.abrir();
    for (var j = 0; j < aneis.length - 1; j++) for (var k = 0; k < n; k++) {
      var A = pt(aneis[j][0], aneis[j][1], k), B = pt(aneis[j][0], aneis[j][1], k + 1), Cq = pt(aneis[j + 1][0], aneis[j + 1][1], k + 1), D = pt(aneis[j + 1][0], aneis[j + 1][1], k);
      var nr = nrmz(cross(sub(B, A), sub(D, A))); if (dot(nr, sub(A, add(C, mul(d, dot(sub(A, C), d))))) < 0) nr = mul(nr, -1);
      var ia = m.v(A, nr), ib = m.v(B, nr), ic = m.v(Cq, nr), id = m.v(D, nr);
      if (dot(cross(sub(B, A), sub(D, A)), nr) > 0) { m.t(ia, ib, ic); m.t(ia, ic, id); } else { m.t(ia, ic, ib); m.t(ia, id, ic); }
    }
    [[0, mul(d, -1)], [L, d]].forEach(function (f) {
      var c0 = m.v(add(C, mul(d, f[0] * MM)), f[1]), ids = [];
      for (var k = 0; k < n; k++) ids.push(m.v(pt(f[0], R - ch, k), f[1]));
      for (var k2 = 0; k2 < n; k2++) { var a = ids[k2], b = ids[(k2 + 1) % n], P0 = m.pos.slice(a * 3, a * 3 + 3), P1 = m.pos.slice(b * 3, b * 3 + 3), Pc = m.pos.slice(c0 * 3, c0 * 3 + 3);
        if (dot(cross(sub(P0, Pc), sub(P1, Pc)), f[1]) > 0) m.t(c0, a, b); else m.t(c0, b, a); }
    });
    m.fechar();
  }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function nrmz(a) { var l = Math.sqrt(dot(a, a)); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 0]; }
  function perpDe(d) { var ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; return nrmz(cross(ref, d)); }
  function pv(p) { return Array.isArray(p) ? p : [Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0]; }
  function desvio(d1, d2) { return Math.acos(Math.max(-1, Math.min(1, -dot(d1, d2)))); }

  /* ------------------------------------------------ MARCAÇÃO (faixa com uv sobre o corpo; só com o.marcacao) */
  function faixa(G, C, d, s0, s1, r, ang, texto) {
    var sM = (s0 + s1) / 2, sH = (s1 - s0) / 2 * 0.35; s0 = sM - sH; s1 = sM + sH;   /* a gravação real é DISCRETA (relevo ~2 mm): a faixa encolhe a 35 % em volta do seu meio (07/11/2026) */
    ang = Math.min(2.6, 7.5 * (s1 - s0) / Math.max(1, r));   /* a faixa no formato do texto (8 : 1) */
    var m = new G.Malha(), u = perpDe(d), w = cross(d, u), nA = 10, pos = [], uv = [];
    m.abrir();
    for (var i = 0; i <= nA; i++) for (var j = 0; j <= 1; j++) {
      var a = -ang / 2 + ang * i / nA, rad = add(mul(u, Math.cos(a)), mul(w, Math.sin(a))), s = j ? s1 : s0;
      m.v(add(add(C, mul(d, s * MM)), mul(rad, (r + 0.06) * MM)), rad); uv.push(i / nA, j);
    }
    for (var k = 0; k < nA; k++) { var a0 = k * 2, b0 = (k + 1) * 2; m.t(a0, b0, a0 + 1); m.t(b0, b0 + 1, a0 + 1); }
    m.fechar(); m.uv = uv;
    return { papel: "marcacao", malha: m, decal: { texto: texto, relevo: true } };   /* relevo: tom sobre tom da peça, sem tinta preta */
  }
  function textoMarca(fonte, dn, rs) { return (fonte === "fabricante" ? "TIGRE" : "AMANCO") + "  " + dn + " mm" + (rs ? " x " + rs + "\"" : "") + "  NBR 5648"; }

  /* ------------------------------------------------ segmentos e teto */
  function segsDe(lod, de, bocas) { if (lod === "longe") return 10; if (lod === "icone") return 64; var s = de >= 75 ? 40 : (de >= 40 ? 32 : 28); return bocas >= 3 ? s - 4 : s; }
  function tri(partes) { return partes.reduce(function (t, p) { return t + (p.decal ? 0 : p.malha.idx.length / 3); }, 0); }
  function teto(G, de) { return G.tetoConexao ? G.tetoConexao(de, true) : (de >= 70 ? 4800 : 3200); }

  /* ================================================ A PEÇA NO NÓ
   * c = { tipo, material, dn, dn2, x, y, z }, eixos = HidGeo.eixosDoNo. Devolve null quando não é dela (a construção de
   * sempre segue). */
  var COTOVELO = { joelho90: 1, joelho45: 1, curva90: 1, curva45: 1, joelho90_reducao: 1, joelho_rosca: 1 };
  var DERIVA = { te: 1, te_reducao: 1, te_bucha: 1, te_rosca: 1, cruzeta: 1 };
  var RETA = { luva: 1, luva_correr: 1, luva_rosca: 1, luva_bucha: 1, uniao: 1, luva_reducao: 1, reducao: 1, bucha: 1, bucha_longa: 1, curva_transposicao: 1 };
  function chaveRosca(c) { var dn2 = c.dn2; if (typeof dn2 === "string" && /\//.test(dn2)) return normRosca(dn2); if (c.rosca) return normRosca(c.rosca); return ROSCA_DN[c.dn] || "1/2"; }
  function cotaFicha(tipo, dn, rs) {
    var T = COTAS[tipo]; if (!T) return null;
    var k = dn + "x" + rs; if (T.dns[k]) return { v: T.dns[k], k: k, pag: T.pag, leitura: T.leitura };
    var ks = Object.keys(T.dns).filter(function (x) { return x.split("x")[0] === String(dn); });
    return ks.length ? { v: T.dns[ks[0]], k: ks[0], pag: T.pag, leitura: T.leitura } : null;
  }

  /* desligar para comparar com a construção de antes (só nos testes de Node: HID_REAL_AGUA=0) */
  function desligado() { return typeof process !== "undefined" && process.env && process.env.HID_REAL_AGUA === "0"; }
  function conexao(G, c, eixos, o) {
    o = o || {};
    if (desligado() || !c || c.material !== "pvc_soldavel" || !eixos || !eixos.length) return null;
    var tipo = c.tipo;
    if (!COTOVELO[tipo] && !DERIVA[tipo] && !RETA[tipo]) return null;
    var oo = {}; Object.keys(o).forEach(function (k) { oo[k] = o[k]; }); oo.semReal = true;
    var base = null; try { base = G.conexaoBruta(c, eixos, oo); } catch (e) { base = null; }
    var lod = o.lod, P = pv(c), real = { fontes: [], pendente: [] }, partes = null;
    var cot = base && base.cotas ? base.cotas : G.cotasConexao("pvc_soldavel", G.tipoBaseGeo ? G.tipoBaseGeo(tipo) : tipo, c.dn, typeof c.dn2 === "number" ? c.dn2 : 0);
    var portas = base ? base.portas : [];
    function portaDe(e) { return portas.filter(function (p) { return p.trecho === e.trecho && p.lado === e.lado; })[0] || null; }
    var fonteFace = cot.perfilMedido ? "fabricante" : "ficha";
    /* FASE 2 (07/11/2026): a referência é a TIGRE — tipo × DN com a medida dela vai pela medida (e a porta acompanha a peça) */
    var tg = null; try { tg = conexaoTigre(G, c, eixos, o, base); } catch (eT) { tg = null; real.erroTigre = String(eT && eT.stack || eT); }
    if (tg) {
      var ctT = {}; Object.keys(cot || {}).forEach(function (k) { ctT[k] = cot[k]; }); Object.keys(tg.cotas).forEach(function (k) { ctT[k] = tg.cotas[k]; });
      ctT.produto = true; if (!ctT.perfilMedido) ctT.perfilMedido = "tigre:" + tg.cotas.chaveTigre; ctT.aConferir = false;
      if (o.marcacao && tg.marca) { tg.marca.decal.papel = (tipo === "joelho_bucha" || tipo === "te_bucha" || tipo === "luva_bucha") ? "azul" : "corpo"; tg.partes.push(tg.marca); }
      return { partes: tg.partes, portas: tg.portas, cotas: ctT, aConferir: false, real: true, fonte: "Tigre" };
    }
    real.fonte = "Amanco";
    try {
      if (COTOVELO[tipo]) partes = cotoveloReal(G, c, eixos, o, cot, portaDe, real);
      else if (DERIVA[tipo]) partes = derivacaoReal(G, c, eixos, o, cot, portaDe, real);
      else partes = retaReal(G, c, eixos, o, cot, portaDe, real);
    } catch (eR) { partes = null; real.erro = String(eR && eR.message || eR); }
    if (!partes) return base;
    var ct = {}; Object.keys(cot || {}).forEach(function (k) { ct[k] = cot[k]; });
    ct.real = real; ct.produto = true; if (!ct.perfilMedido) ct.perfilMedido = "real-agua";
    if (o.marcacao && real.marca) { real.marca.decal.papel = (tipo === "joelho_bucha" || tipo === "te_bucha" || tipo === "luva_bucha") ? "azul" : "corpo"; partes.push(real.marca); }
    return { partes: partes, portas: portas, cotas: ct, aConferir: !!(base && base.aConferir) || real.pendente.length > 0, real: true, fonteFace: fonteFace };
  }

  /* ================================================ A PEÇA PELA MEDIDA TIGRE (fase 2, 07/11/2026)
   * TIGRE[tipo-DN] (tools/gerar-hid-real-agua-tigre.js): o perfil externo medido de cada perna (cotovelo, derivação) ou do
   * eixo (peça em linha), a face e o CONECTOR (onde o tubo para) de cada boca, o raio central, o furo, o código Tigre. O
   * interno é o do produto: bolsa no DE do tubo até o conector, batente, furo; a rosca com filetes; a bucha de latão.
   * A PORTA ACOMPANHA A PEÇA: z = face, recuo = conector, pb = face − conector (o tubo entra na bolsa certa). */
  function chaveT(tipo, dn, dn2) { return tipo + "-" + dn + (dn2 ? "x" + dn2 : ""); }
  function medidaTigre(tipo, dn, dn2) { return TIGRE[chaveT(tipo, dn, dn2)] || null; }
  function roscaDaDescricao(t, dn) {
    var m = /x\s*([\d\s\/]+?)\s*(''|"|”|pol)/i.exec((t && t.descricao) || ""); if (m && rosca(m[1])) return rosca(m[1]);
    /* sem a bitola na descrição: a mais vendida do tipo (joelho/tê 32 = 3/4", luva 32 = 1") */
    var tp = t && t.fam || "", k = /Joelho|Te /.test(tp) && dn === 32 ? "3/4" : (ROSCA_DN[dn] || "1/2");
    return rosca(k);
  }
  function marcaTigre(t, dn) { return "TIGRE  " + dn + " mm  NBR 5648" + (t && t.codigo ? "  " + t.codigo : ""); }
  function rBocaDe(ext, face, larg) { var r = 0; ext.forEach(function (q) { if (q[0] >= face - (larg || 3)) r = Math.max(r, q[1]); }); return r || ext[ext.length - 1][1]; }
  /* a perna Tigre (s do centro) → perna do construtor (u da face), com o tipo de boca */
  function pernaT(G, pt, tipoBoca, rs, furo) {
    var rA = rBocaDe(pt.ext, pt.face), b = bocaDe(G, pt.dn, 2 * rA), pe = { tipo: tipoBoca || "sold", face: pt.face, pb: Math.max(1, pt.face - pt.conector), b: b, dn: pt.dn, rBoca: rA };
    if (furo) b.furo = Math.min(furo, b.rIn - 0.8);
    comPerfil(pe, pt);
    if (tipoBoca === "roscaF" && rs) { pe.rosca = rs; pe.Lr = pe.pb; if (rs.D / 2 + 0.3 > rA - 1.2) { pe.tipo = "sold"; } }
    if (tipoBoca === "latao" && rs) { pe.rosca = rs; pe.Lr = pe.pb; pe.rL = Math.min(rA - 1.4, rs.D / 2 + 1.1); if (pe.rL < rs.D / 2 + 0.3) pe.tipo = "sold"; }
    return pe;
  }
  function portaT(base, e, face, cn, rA) {
    if (e.passante) return null;
    var p0 = base && base.portas ? base.portas.filter(function (p) { return p.trecho === e.trecho && p.lado === e.lado; })[0] : null, q = {};
    if (p0) Object.keys(p0).forEach(function (k) { q[k] = p0[k]; }); else { q.trecho = e.trecho; q.lado = e.lado; q.dir = e.dir; q.dn = e.dn; }
    ["ponta", "bolsaAtras", "faceProduto", "produto"].forEach(function (k) { delete q[k]; });
    q.z = face * MM; q.recuo = Math.max(0, cn) * MM; q.pb = Math.max(0, face - Math.max(0, cn)) * MM; q.rBoca = rA; q.tigre = true;
    return q;
  }
  function conexaoTigre(G, c, eixos, o, base) {
    var tipo = c.tipo, dn = c.dn;
    if (COTOVELO[tipo] && !/45$/.test(tipo)) {
      if (eixos.length < 2) return null;
      var dns = [eixos[0].dn || dn, eixos[1].dn || dn], t = tipo === "joelho90_reducao" ? medidaTigre(tipo, Math.max(dns[0], dns[1]), Math.min(dns[0], dns[1])) : medidaTigre(tipo, dn);
      return t ? cotoveloTigre(G, c, eixos, o, base, t) : null;
    }
    if (DERIVA[tipo]) {
      if (eixos.length < 3) return null;
      var par = parLinha(eixos), rams = eixos.filter(function (_, k) { return k !== par[0] && k !== par[1]; }), dR = Math.min.apply(null, rams.map(function (e) { return e.dn || dn; }));
      var t2 = (tipo === "te" || tipo === "te_reducao") ? (dR < dn - 0.5 ? medidaTigre("te_reducao", dn, dR) : medidaTigre("te", dn)) : medidaTigre(tipo, dn);
      return t2 ? derivacaoTigre(G, c, eixos, o, base, t2, par, rams) : null;
    }
    if (RETA[tipo] && tipo !== "curva_transposicao") {
      if (eixos.length < 2 || Math.abs(dot(eixos[0].dir, eixos[1].dir) + 1) > 0.02) return null;
      var red = /^(bucha|bucha_longa|luva_reducao|reducao)$/.test(tipo), d1 = eixos[0].dn || dn, d2 = eixos[1].dn || dn;
      var t3 = red ? medidaTigre(tipo === "reducao" ? "luva_reducao" : tipo, Math.max(d1, d2), Math.min(d1, d2)) : medidaTigre(tipo, dn);
      return t3 ? retaTigre(G, c, eixos, o, base, t3) : null;
    }
    if (tipo === "curva_transposicao") { var t4 = medidaTigre(tipo, dn); return t4 ? transposicaoTigre(G, c, eixos, o, base, t4) : null; }
    return null;
  }
  function parLinha(eixos) { var par = null, best = 1e9; for (var i = 0; i < eixos.length; i++) for (var j = i + 1; j < eixos.length; j++) { var dv = desvio(eixos[i].dir, eixos[j].dir); if (dv < best) { best = dv; par = [i, j]; } } return par; }
  function varrerTeto(G, lim, segs, lod, fn) { var partes; do { partes = fn(segs); segs -= 4; } while (tri(partes) > lim && segs >= 12 && lod !== "icone"); return { partes: partes, segs: segs + 4 }; }
  function cotoveloTigre(G, c, eixos, o, base, t, semPortas) {
    var e1 = eixos[0], e2 = eixos[1], del = desvio(e1.dir, e2.dir), lod = o.lod, P = pv(c), tipo = c.tipo;
    if (Math.abs(del - Math.PI / 2) > 0.03) return null;   /* a medida é a de 90° */
    if (o.pernaRosca === 0 && (tipo === "joelho_rosca" || tipo === "joelho_bucha")) { var tq = e1; e1 = e2; e2 = tq; }   /* a boca de rosca no 1º eixo */
    var ps = t.pernas.slice(), pa, pb, rs = null, papelB = "sold";
    if (tipo === "joelho_rosca" || tipo === "joelho_bucha") { pb = ps.filter(function (x) { return x.id === 2; })[0]; pa = ps.filter(function (x) { return x !== pb; })[0]; rs = roscaDaDescricao(t, c.dn); papelB = tipo === "joelho_rosca" ? "roscaF" : "latao"; }
    else if (t.dn2) { pa = ps.filter(function (x) { return x.dn === (e1.dn || c.dn); })[0]; pb = ps.filter(function (x) { return x !== pa; })[0]; }
    else { pa = ps[0]; pb = ps[1]; }
    if (!pa || !pb) return null;
    var peA = pernaT(G, pa, "sold", null, t.furo), peB = pernaT(G, pb, papelB, rs, t.furo);
    /* o corpo do arco medido só vale quando é o corpo (≤ 6 % acima do parâmetro): nas peças de rosca o percentil pega o anel da bolsa */
    var arcoOk = /^(joelho90|curva90)$/.test(tipo) && t.rArcoMed && t.rArcoMed <= t.rC * 1.06, rArcoU = arcoOk ? t.rArcoMed : t.rC;
    comPerfil(peA, pa, rArcoU); comPerfil(peB, pb, rArcoU);
    var de = G.cotasTubo("pvc_soldavel", c.dn).de, rc = (arcoOk ? t.rcMed : (t.rcMedC || t.rcMed)) || t.rc || Math.max(peA.b.rC, peB.b.rC), curva = /^curva/.test(tipo);
    var cam = G.cotovelo(P, e1.dir, e2.dir, peA.face * MM, peB.face * MM, rc * MM, lod === "longe" ? Math.PI / 4 : del / (curva ? 24 : 10) * 1.0001);
    var L = cam.L / MM, Rb = cam.Rb / MM, tl = Rb * Math.tan(del / 2), sMid = peA.face - tl + Rb * del / 2;
    var lp = escala(laco(juntar2(pernaExt(peA, lod), pernaExt(peB, lod), L, sMid), juntar2(pernaInt(peA, lod), pernaInt(peB, lod), L, sMid)));
    var papel = tipo === "joelho_bucha" ? "azul" : "corpo";
    var v = varrerTeto(G, teto(G, de), segsDe(lod, de, 2), lod, function (sg) { var m = new G.Malha(); G.varrer(m, cam, lp, sg, true); return [{ papel: papel, malha: m }]; });
    if (peB.tipo === "latao") v.partes.push(lataoParte(G, add(P, mul(e2.dir, peB.face * MM)), mul(e2.dir, -1), peB, lod, v.segs));
    var portas = semPortas ? [] : [portaT(base, e1, pa.face, pa.conector, peA.rBoca), portaT(base, e2, pb.face, pb.conector, peB.rBoca)].filter(Boolean);
    return { partes: v.partes, portas: portas, marca: faixa(G, add(P, mul(e1.dir, peA.face * MM)), mul(e1.dir, -1), Math.min(4, peA.pb * 0.2), Math.max(6, Math.min(peA.pb - 1, peA.face - tl - 1)), peA.b.rB, 1.6, marcaTigre(t, c.dn)),
             cotas: { rosca: rs ? rs.nome : undefined, z: pa.face, zp: pa.face, pb: pa.face - pa.conector, od: 2 * peA.rBoca, R: curva ? rc : undefined, rCentral: rc, chaveTigre: chaveT(tipo, t.dn, t.dn2), codigoTigre: t.codigo, fonteReal: "Tigre — " + (t.descricao || t.fam) + " (medidas da família da Biblioteca do escritório)", origemFace: "produto Tigre" } };
  }
  function derivacaoTigre(G, c, eixos, o, base, t, par, rams) {
    var tipo = c.tipo, lod = o.lod, P = pv(c), ea = eixos[par[0]], eb = eixos[par[1]];
    var linha = t.pernas.filter(function (x) { return x.linha; }), ramT = t.pernas.filter(function (x) { return !x.linha; });
    if (linha.length < 2 || ramT.length < rams.length) return null;
    var rs = (tipo === "te_rosca" || tipo === "te_bucha") ? roscaDaDescricao(t, c.dn) : null, papelR = tipo === "te_rosca" ? "roscaF" : (tipo === "te_bucha" ? "latao" : "sold");
    var la = pernaT(G, linha[0], "sold", null, t.furo), lb = pernaT(G, linha[1], "sold", null, t.furo), de = G.cotasTubo("pvc_soldavel", c.dn).de;
    var L = la.face + lb.face, camL = G.reta(add(P, mul(ea.dir, la.face * MM)), mul(ea.dir, -1));
    var lpL = escala(laco(juntar2(pernaExt(la, lod), pernaExt(lb, lod), L, la.face), juntar2(pernaInt(la, lod), pernaInt(lb, lod), L, la.face)));
    var pr = rams.map(function (er, k) {
      var pt = ramT[k], pe = pernaT(G, pt, papelR, rs, t.furo), s0 = Math.max(0.5, Math.min(la.b.furo, pe.b.rC) * 0.9), uS = pe.face - s0;
      var ex = ate(pernaExt(pe, lod), uS).map(function (x) { return [pe.face - x[0], x[1]]; }).reverse();
      var it = ate(pernaInt(pe, lod), uS).map(function (x) { return [pe.face - x[0], Math.min(x[1], pe.b.rC - 0.4)]; }).reverse();
      return { e: er, pt: pt, pe: pe, cam: G.reta(P, er.dir), lp: escala(laco(ex, it)) };
    });
    var papel = tipo === "te_bucha" ? "azul" : "corpo";
    var v = varrerTeto(G, teto(G, de), segsDe(lod, de, eixos.length), lod, function (sg) { var m = new G.Malha(); G.varrer(m, camL, lpL, sg, true); pr.forEach(function (r) { G.varrer(m, r.cam, r.lp, sg, true); }); return [{ papel: papel, malha: m }]; });
    pr.forEach(function (r) { if (r.pe.tipo === "latao") v.partes.push(lataoParte(G, add(P, mul(r.e.dir, r.pe.face * MM)), mul(r.e.dir, -1), r.pe, lod, v.segs)); });
    var portas = [portaT(base, ea, linha[0].face, linha[0].conector, la.rBoca), portaT(base, eb, linha[1].face, linha[1].conector, lb.rBoca)]
      .concat(pr.map(function (r) { var q = portaT(base, r.e, r.pt.face, r.pt.conector, r.pe.rBoca); if (q) q.ramal = true; return q; })).filter(Boolean);
    return { partes: v.partes, portas: portas, marca: faixa(G, add(P, mul(ea.dir, la.face * MM)), mul(ea.dir, -1), Math.min(4, la.pb * 0.2), Math.max(6, la.pb - 1), la.b.rB, 1.5, marcaTigre(t, c.dn)),
             cotas: { rosca: rs ? rs.nome : undefined, zr: linha[0].face, zp: linha[0].face, zb: ramT[0].face, pb: linha[0].face - linha[0].conector, od: 2 * la.rBoca, odb: 2 * pr[0].pe.rBoca, chaveTigre: chaveT(t.dn2 ? "te_reducao" : tipo, t.dn, t.dn2), codigoTigre: t.codigo, fonteReal: "Tigre — " + (t.descricao || t.fam), origemFace: "produto Tigre" } };
  }
  /* a peça em LINHA pelo perfil do eixo: x do centro; a boca de sinal +1 vai para o eixo eP (u = x − min no caminho) */
  /* a boca de ROSCA da luva com rosca/com bucha: a da ponta MAIS LARGA (a foto do produto — Tigre e Amanco — mostra a rosca/o latão
     no corpo largo; a família do escritório troca as bocas); com as duas pontas iguais, a boca 2 da família */
  function roscaBoca(t) {
    var e0 = t.ext[0][1], e1 = t.ext[t.ext.length - 1][1];
    if (Math.abs(e0 - e1) < 0.3) return t.bocas.filter(function (b) { return b.id === 2; })[0] || t.bocas[t.bocas.length - 1];
    var s = e0 > e1 ? -1 : 1; return t.bocas.filter(function (b) { return b.sinal === s; })[0];
  }
  function bocaTipo(tipo, boca, t) {
    if (tipo === "luva_rosca" && boca === roscaBoca(t)) return "roscaF";
    if (tipo === "luva_bucha" && boca === roscaBoca(t)) return "latao";
    if (tipo === "adaptador" && boca.id === 2) return "roscaM";
    return "sold";
  }
  function internoReta(G, t, tipo, lod, rs, inv) {
    /* o interno de ponta a ponta (u de 0 a L), com cada boca: bolsa até o conector (batente), rosca ou latão; ponta = sem bolsa */
    var L = t.L, bocas = t.bocas.map(function (b) { var u0 = inv ? t.max - b.conector : b.conector - t.min, naPontaMin = inv ? b.sinal > 0 : b.sinal < 0, prof = naPontaMin ? u0 : L - u0; var tb = bocaTipo(tipo, b, t); return { b: b, inicio: naPontaMin, prof: prof, tipo: tb, dn: /^luva_(rosca|bucha)$/.test(tipo) && tb === "sold" ? t.dn : b.dn }; });
    var furo = t.furo || 1e9, ini = bocas.filter(function (x) { return x.inicio; })[0], fim = bocas.filter(function (x) { return !x.inicio; })[0];
    function lado(bx) {
      if (!bx || bx.prof < 1) return null;
      var rIn = G.cotasTubo("pvc_soldavel", bx.dn).de / 2 * G.FOLGA, chi = Math.min(0.6, rIn * 0.04);
      furo = Math.min(furo, rIn - 0.8);
      if (bx.tipo === "roscaF" && rs) { var rM = rs.D / 2, rm = rM - rs.h; furo = Math.min(furo, rm - 0.6); var q = [[0, rM + 0.3]]; q = lod === "longe" ? q.concat([[bx.prof, rm + rs.h * 0.3]]) : q.concat(zigue(0.5, bx.prof - 0.2, rm, rM, rs.p)); q.push([bx.prof, rm]); return q; }
      if (bx.tipo === "latao" && rs) { var rL = rs.D / 2 + 1.1; bx.rL = rL; furo = Math.min(furo, rs.D / 2 - rs.h - 0.8); return [[0, rL], [bx.prof, rL]]; }
      if (bx.tipo === "roscaM") return null;   /* a rosca macho é por fora; por dentro, o furo */
      return [[0, rIn + chi], [chi, rIn], [bx.prof, rIn]];
    }
    var a = lado(ini), z = lado(fim), int = [];
    if (furo > 1e8) furo = (t.ext[0][1]) * 0.6;
    if (a) int = int.concat(a).concat([[a[a.length - 1][0], furo]]); else int.push([0, furo]);
    if (z) { var zz = z.map(function (q) { return [L - q[0], q[1]]; }).reverse(); int.push([zz[0][0], furo]); int = int.concat(zz); } else int.push([L, furo]);
    return { int: int, bocas: bocas };
  }
  function retaTigre(G, c, eixos, o, base, t) {
    var tipo = c.tipo, lod = o.lod, P = pv(c), e1 = eixos[0], e2 = eixos[1], rs = (tipo === "luva_rosca" || tipo === "luva_bucha") ? roscaDaDescricao(t, c.dn) : null;
    /* qual eixo recebe a boca de sinal +1: a de rosca vai para o 2º eixo; na redução, o DN de cada boca */
    var bMais = t.bocas.filter(function (b) { return b.sinal > 0; })[0], eMais = e2;
    if (/bucha|reducao/.test(tipo)) eMais = (e1.dn || c.dn) === bMais.dn ? e1 : e2;
    else if (rs) eMais = roscaBoca(t).sinal > 0 ? e2 : e1;
    else if (tipo === "adaptador") eMais = bMais.id === 2 ? e2 : e1;
    var eMenos = eMais === e1 ? e2 : e1, d = eMais.dir, L = t.L;
    var ext = t.ext.map(function (q) { return [q[0] - t.min, q[1]]; });
    if (ext[0][0] > 1e-6) ext.unshift([0, ext[0][1] * 0.97]); else ext[0] = [0, ext[0][1] * 0.97];
    if (ext[ext.length - 1][0] < L - 1e-6) ext.push([L, ext[ext.length - 1][1] * 0.97]);
    var I = internoReta(G, t, tipo, lod, rs, false), de = G.cotasTubo("pvc_soldavel", c.dn).de, cam = G.reta(add(P, mul(d, t.min * MM)), d);
    /* UNIÃO (a foto é a verdade, 07/11/2026): a família tem a porca lisa; o produto tem a porca com NERVURAS de aperto — o corpo da
       porca desce 1 mm e as nervuras sobem até o raio medido (a silhueta fica a da medida) */
    var nerv = null;
    if (tipo === "uniao" && lod !== "longe") {
      var rMx = Math.max.apply(null, ext.map(function (q) { return q[1]; })), zona = ext.filter(function (q) { return q[1] >= rMx - 0.3; });
      if (zona.length >= 2) { var uA = zona[0][0], uB = zona[zona.length - 1][0]; ext = ext.map(function (q) { return q[1] >= rMx - 0.3 ? [q[0], q[1] - 1] : q; }); nerv = { uA: uA, uB: uB, r: rMx }; }
    }
    var lp = escala(laco(ext, I.int)), papel = tipo === "luva_bucha" ? "azul" : "corpo";
    var v = varrerTeto(G, teto(G, de), segsDe(lod, de, 2), lod, function (sg) { var m = new G.Malha(); G.varrer(m, cam, lp, sg, true); return [{ papel: papel, malha: m }]; });
    if (nerv && nerv.uB - nerv.uA > 3) {
      var mN = v.partes[0].malha, uu = perpDe(d), ww = cross(d, uu), Cn = cam.em((nerv.uA + nerv.uB) / 2 * MM).p, nN = 8;
      for (var kN = 0; kN < nN; kN++) {
        var aN = 2 * Math.PI * (kN + 0.5) / nN, rad = add(mul(uu, Math.cos(aN)), mul(ww, Math.sin(aN))), tg = cross(rad, d);   /* eixos com cross(ax1, ax2) = ax0: faces para fora */
        G.caixaM(mN, add(Cn, mul(rad, (nerv.r - 0.75) * MM)), [rad, d, tg], [0.75 * MM, ((nerv.uB - nerv.uA) / 2 - 0.6) * MM, Math.max(1, 0.09 * nerv.r) * MM]);
      }
    }
    I.bocas.forEach(function (bx) {
      if (bx.tipo === "latao" && rs) { var F = bx.inicio ? add(P, mul(d, t.min * MM)) : add(P, mul(d, t.max * MM)); v.partes.push(lataoParte(G, F, bx.inicio ? d : mul(d, -1), { rosca: rs, Lr: bx.prof, rL: bx.rL }, lod, v.segs)); }
    });
    if (tipo === "luva_correr" && lod !== "longe") I.bocas.forEach(function (bx) { if (bx.prof < 1) return; var F = bx.inicio ? add(P, mul(d, t.min * MM)) : add(P, mul(d, t.max * MM)); v.partes.push(anelVedacao(G, F, bx.inicio ? d : mul(d, -1), bx.dn, v.segs)); });
    var portas = [];
    I.bocas.forEach(function (bx) {
      var e = bx.b.sinal > 0 ? eMais : eMenos, face = bx.b.sinal > 0 ? t.max : -t.min, cn = bx.b.sinal > 0 ? bx.b.conector : -bx.b.conector;
      var q = portaT(base, e, face, cn, rBocaDe(t.ext.map(function (x) { return [bx.b.sinal > 0 ? x[0] : -x[0], x[1]]; }), face)); if (q) portas.push(q);
    });
    var rMeio = rEm(ext, L / 2);
    return { partes: v.partes, portas: portas, marca: faixa(G, cam.em(0).p, d, L * 0.3, L * 0.7, rMeio, 1.4, marcaTigre(t, c.dn)),
             cotas: { rosca: rs ? rs.nome : undefined, L: L, pb: t.bocas[0] ? Math.abs((t.bocas[0].sinal > 0 ? t.max : t.min) - t.bocas[0].conector) : undefined, od: 2 * rEm(ext, 0.5), chaveTigre: chaveT(tipo, t.dn, t.dn2), codigoTigre: t.codigo, fonteReal: "Tigre — " + (t.descricao || t.fam), origemFace: "produto Tigre" } };
  }
  function anelVedacao(G, F, dIn, dn, segs) {
    var rI = G.cotasTubo("pvc_soldavel", dn).de / 2 * G.FOLGA, de = 2 * rI, a = 2.5, b = a + Math.max(2.2, 0.08 * de), h = Math.max(1, 0.05 * de), ma = new G.Malha();
    G.varrer(ma, G.reta(F, dIn), escala([[a, rI - 0.35], [a, rI + h * 0.4], [b, rI + h * 0.4], [b, rI - 0.35]]), segs, true);
    return { papel: "anel", malha: ma };
  }
  function transposicaoTigre(G, c, eixos, o, base, t) {
    var lod = o.lod, e1 = eixos[0], e2 = eixos[1], de = G.cotasTubo("pvc_soldavel", c.dn).de, Lt = t.L, pb = Lt / 2 - t.conector;
    if (Math.abs(dot(e1.dir, e2.dir) + 1) > 0.02) return null;
    var axT = nrmz(sub(e2.dir, e1.dir)), upT = Math.abs(axT[1]) < 0.9 ? [0, 1, 0] : perpDe(axT);
    if (o.cima) { var cu = pv(o.cima), cq = sub(cu, mul(axT, dot(cu, axT))); if (Math.sqrt(dot(cq, cq)) > 0.5) upT = nrmz(cq); }
    /* o "S" do produto: quatro arcos tangentes de raio R (o "Raio" da família) até a crista H — sobe, passa por cima, desce */
    /* a largura do "S": 2·B (a cota B da família, do meio à base do arco); o raio dos arcos sai da largura e da crista */
    var sideT = nrmz(cross(axT, upT)), Ht = t.crista, W0 = t.B > Ht ? 2 * t.B : 0, w1 = W0 ? W0 / 4 : 0, R = W0 ? (w1 * w1 + Ht * Ht / 4) / Ht : Math.max(t.raio || Ht, Ht / 2 + 0.5);
    if (!W0) { var cth = 1 - Ht / (2 * R); w1 = R * Math.sqrt(Math.max(0, 1 - cth * cth)); }
    var W = 4 * w1;
    var Fa0 = add(pv(c), mul(e1.dir, (Lt / 2) * MM)), xa = (Lt - W) / 2, est = [], n = lod === "longe" ? 8 : 32;
    function hS(sm) { var x = sm - xa, xx = Math.min(x, W - x); if (x <= 0 || x >= W) return 0; return xx <= w1 ? R - Math.sqrt(Math.max(0, R * R - xx * xx)) : Ht - (R - Math.sqrt(Math.max(0, R * R - (2 * w1 - xx) * (2 * w1 - xx)))); }
    for (var i = 0; i <= n; i++) est.push((xa + W * i / n) * MM);
    var cam = { estacoes: est, em: function (s) {
      var sm = s / MM, h = hS(sm) * MM, dh = (hS(sm + 0.05) - hS(sm - 0.05)) / 0.1;
      var tt = nrmz(add(axT, mul(upT, dh))); return { p: add(add(Fa0, mul(axT, s)), mul(upT, h)), t: tt, u: sideT, v: cross(tt, sideT) }; } };
    var rB = Math.max(t.rBolsa, de / 2 * G.FOLGA + 0.8), rT = Math.max(t.rTubo, de / 2 - 0.2), rIn = de / 2 * G.FOLGA, furo = Math.min(rIn - 0.8, rT - 1.3);
    var ext = [[0, rB - 0.3], [0.4, rB], [pb + 0.5, rB], [pb + 1.5, rT], [Lt - pb - 1.5, rT], [Lt - pb - 0.5, rB], [Lt - 0.4, rB], [Lt, rB - 0.3]];
    var int = [[0, rIn + 0.4], [0.5, rIn], [pb, rIn], [pb, furo], [Lt - pb, furo], [Lt - pb, rIn], [Lt - 0.5, rIn], [Lt, rIn + 0.4]];
    var lp = escala(laco(ext, int));
    var v = varrerTeto(G, teto(G, de), segsDe(lod, de, 2), lod, function (sg) { var m = new G.Malha(); G.varrer(m, cam, lp, sg, true); return [{ papel: "corpo", malha: m }]; });
    var portas = [portaT(base, e1, Lt / 2, t.conector, rB), portaT(base, e2, Lt / 2, t.conector, rB)].filter(Boolean);
    return { partes: v.partes, portas: portas, marca: faixa(G, Fa0, axT, pb * 0.2, pb * 0.9, rB, 1.6, marcaTigre(t, c.dn)), cotas: { L: Lt, A: Lt / 2, pb: pb, od: 2 * rB, chaveTigre: chaveT("curva_transposicao", t.dn), codigoTigre: t.codigo, fonteReal: "Tigre — " + (t.descricao || t.fam), origemFace: "produto Tigre" } };
  }
  /* as PEÇAS DE PONTO pela medida Tigre: F = face da boca soldável, d = para dentro da peça */
  function simplesTigre(G, tipo, dn, F, d, o) {
    var t = medidaTigre(tipo, dn); if (!t) return null;
    /* o adaptador da família do fabricante acima do DN 32 tem a rosca sempre no DN 32 (tabela dela) — não é o produto: fica a ficha */
    if (tipo === "adaptador" && dn > 32) return null;
    var lod = o.lod, de = G.cotasTubo("pvc_soldavel", dn).de;
    if (tipo === "joelho_bucha") {
      var ps = t.pernas, pS = ps.filter(function (x) { return x.id !== 2; })[0], saida = o.saida ? nrmz(pv(o.saida)) : perpDe(d), V0 = add(F, mul(d, pS.face * MM));
      var r = cotoveloTigre(G, { tipo: "joelho_bucha", material: "pvc_soldavel", dn: dn, x: V0[0], y: V0[1], z: V0[2] }, [{ trecho: "s", lado: 1, dir: mul(d, -1), dn: dn }, { trecho: "r", lado: 0, dir: saida, dn: dn }], o, null, t, true);
      if (!r) return null;
      r.cotas.L = null; r.cotas.zr = (ps.filter(function (x) { return x.id === 2; })[0] || {}).face;
      return r;
    }
    var sb = tipo === "luva_bucha" ? t.bocas.filter(function (b) { return b !== roscaBoca(t); })[0] : (t.bocas.filter(function (b) { return b.id === 1; })[0] || t.bocas[0]), inv = sb.sinal > 0;   /* inv: a boca soldável está no x máximo */
    var L = t.L, ext = t.ext.map(function (q) { return [inv ? t.max - q[0] : q[0] - t.min, q[1]]; }).sort(function (a, b) { return a[0] - b[0]; });
    if (ext[0][0] > 1e-6) ext.unshift([0, ext[0][1] * 0.97]); else ext[0] = [0, ext[0][1] * 0.97];
    if (ext[ext.length - 1][0] < L - 1e-6) ext.push([L, ext[ext.length - 1][1]]);
    var rs = tipo === "luva_bucha" ? roscaDaDescricao(t, dn) : (tipo === "adaptador" ? (rosca((o.rosca) || ROSCA_DN[dn]) || rosca("1/2")) : null);
    var I = internoReta(G, t, tipo, lod, rs, inv), int = I.int;
    if (tipo === "cap") { var fundo = I.bocas[0].prof; int = int.filter(function (q) { return q[0] <= fundo + 1e-6; }); int.push([fundo + 0.0001, 0]); ext.push([L, 0]); }
    if (tipo === "adaptador" && rs && lod !== "longe") {
      /* a ROSCA MACHO aparente: filetes BSP no trecho final, a partir do fim da bolsa + colar */
      /* o trecho da rosca = o último degrau de raio constante do perfil medido; a crista no raio medido */
      var rM = ext[ext.length - 2] ? ext[ext.length - 2][1] : rEm(ext, L - 1), uR = L - 1;
      for (var kq = ext.length - 1; kq >= 0 && Math.abs(ext[kq][1] - rM) < 0.25; kq--) uR = ext[kq][0];
      uR = Math.max(uR + 0.3, I.bocas[0].prof + 1);
      ext = ext.filter(function (q) { return q[0] < uR; }).concat([[uR, rM]]).concat(zigue(uR + 0.6, L - 0.4, rM - rs.h * 0.85, rM, rs.p)).concat([[L, rM - rs.h]]);
    }
    var cam = G.reta(F, d), lp = escala(laco(ext, int)), papel = tipo === "luva_bucha" ? "azul" : "corpo";
    var v = varrerTeto(G, teto(G, de), segsDe(lod, de, 2), lod, function (sg) { var m = new G.Malha(); G.varrer(m, cam, lp, sg, true); return [{ papel: papel, malha: m }]; });
    I.bocas.forEach(function (bx) {
      var Fb = bx.inicio ? F : add(F, mul(d, L * MM)), db = bx.inicio ? d : mul(d, -1);
      if (bx.tipo === "latao" && rs) v.partes.push(lataoParte(G, Fb, db, { rosca: rs, Lr: bx.prof, rL: bx.rL }, lod, v.segs));
      if (tipo === "luva_correr" && lod !== "longe" && bx.prof > 1) v.partes.push(anelVedacao(G, Fb, db, bx.dn, v.segs));
    });
    return { partes: v.partes, portas: [], marca: faixa(G, F, d, Math.min(3, L * 0.1), Math.max(5, Math.min(L * 0.5, I.bocas[0].prof - 1)), rEm(ext, L * 0.3), 1.4, marcaTigre(t, dn)),
             cotas: { L: L, pb: I.bocas[0].prof, od: 2 * ext[1][1], chaveTigre: chaveT(tipo, dn), codigoTigre: t.codigo, fonteReal: "Tigre — " + (t.descricao || t.fam), origemFace: "produto Tigre" } };
  }
  /* o PONTO DE ÁGUA (js/biminstui.js) posiciona a peça pelo comprimento e pela bolsa: com a medida Tigre, os dela */
  function pontoAgua(tipo, dn) {
    var t = medidaTigre(tipo, dn); if (!t || desligado() || (tipo === "adaptador" && dn > 32)) return null;
    if (tipo === "joelho_bucha") { var pS = t.pernas.filter(function (x) { return x.id !== 2; })[0]; return { z: pS.face, pb: pS.face - pS.conector }; }
    var sb = tipo === "luva_bucha" ? t.bocas.filter(function (b) { return b !== roscaBoca(t); })[0] : (t.bocas.filter(function (b) { return b.id === 1; })[0] || t.bocas[0]);
    return { L: t.L, pb: Math.abs((sb.sinal > 0 ? t.max : t.min) - sb.conector) };
  }

  /* o externo do PERFIL MEDIDO de uma perna (dados-fonte/hidro/geometria/produto-perfis.json, s do centro) → u da face */
  function comPerfil(pe, perna, rArco) {
    if (!pe || !perna || !(perna.ext || []).length) return pe;
    var f = perna.face, q = perna.ext.map(function (x) { return [Math.max(0, f - x[0]), x[1]]; }).sort(function (a, b) { return a[0] - b[0]; });
    if (rArco > 0) q.push([q[q.length - 1][0] + 0.4, rArco]);   /* o corpo do ARCO medido (rArco) */
    if (q[0][0] > 1e-6) q.unshift([0, q[0][1]]);
    var ch = Math.min(0.5, q[0][1] * 0.03); q[0] = [0, q[0][1] - ch]; q.splice(1, 0, [ch, q[0][1] + ch]);
    pe.extP = q; return pe;
  }
  function pernasDoPerfil(pp) {   /* linha (as duas opostas) e as outras */
    var ps = (pp && pp.pernas) || [], linha = ps.filter(function (x) { return ps.some(function (y) { return y !== x && dot(x.d, y.d) < -0.99; }); });
    return { linha: linha, ramal: ps.filter(function (x) { return linha.indexOf(x) < 0; }) };
  }
  /* a perna "sold" de um eixo: face e bolsa pela porta (a construção); sem porta, pela cota */
  function pernaSold(G, dn, face, pb, od) { return { tipo: "sold", face: face, pb: pb, b: bocaDe(G, dn, od), dn: dn }; }
  function odLuva(G, dn) { return G.cotasConexao("pvc_soldavel", "luva", dn).od; }
  function pbTubo(G, dn) { return G.cotasTubo("pvc_soldavel", dn).pb; }

  /* ---------------------------------------------- COTOVELO: joelho, curva, joelho de redução, joelho com rosca */
  function cotoveloReal(G, c, eixos, o, cot, portaDe, real) {
    if (eixos.length < 2) return null;
    var e1 = eixos[0], e2 = eixos[1], tipo = c.tipo, lod = o.lod, del = desvio(e1.dir, e2.dir), P = pv(c);
    if (del > Math.PI * 0.995) return null;
    var p1 = portaDe(e1), p2 = portaDe(e2), dnA = e1.dn || c.dn, dnB = e2.dn || c.dn;
    var pern = [], rs = null, fi = null;
    if (tipo === "joelho_rosca") {
      rs = rosca(chaveRosca(c)); fi = cotaFicha("joelho_rosca", c.dn, rs ? rs.nome : "");
      if (!fi || !rs) return null;
      real.fontes.push(FONTE_FICHA + ", pág. " + fi.pag + " (" + fi.k + "): " + fi.leitura);
      /* a perna de ROSCA é a 2ª (o tubo de saída, lado 0, ou a que o chamador marcar) */
      var iR = o.pernaRosca != null ? o.pernaRosca : 1;
      var pS = pernaSold(G, c.dn, fi.v.A, pbTubo(G, c.dn), fi.v.B);
      var pR = { tipo: "roscaF", face: fi.v.C, pb: Math.max(8, fi.v.C - fab(c.dn).rc * 0.9), Lr: Math.max(8, fi.v.C - fab(c.dn).rc * 0.9), rosca: rs, b: bocaDe(G, c.dn, fi.v.B) };
      pern = iR ? [pS, pR] : [pR, pS];
      real.fontes.push("rosca " + rs.nome + "\" BSP (NBR 8133): Ø " + rs.D + " mm, passo " + rs.p + " mm");
    } else {
      var od1 = p1 && p1.rBoca ? 2 * p1.rBoca : (dnA !== c.dn ? odLuva(G, dnA) : cot.od), od2 = p2 && p2.rBoca ? 2 * p2.rBoca : (dnB !== c.dn ? odLuva(G, dnB) : cot.od);
      var f1 = p1 ? p1.z / MM : cot.z, f2 = p2 ? p2.z / MM : (cot.zp || cot.z), b1 = p1 ? p1.pb / MM : cot.pb, b2 = p2 ? p2.pb / MM : cot.pb;
      if (tipo === "joelho90_reducao") {
        var dG = Math.max(dnA, dnB), dP = Math.min(dnA, dnB), fr = cotaFicha("joelho90_reducao", dG, String(dP)); fr = fr && fr.k === dG + "x" + dP ? fr : null;
        if (fr) { real.fontes.push(FONTE_FICHA + ", pág. " + fr.pag + " (" + fr.k + "): " + fr.leitura); if (!p1) { f1 = dnA === dG ? fr.v.C : fr.v.A; } if (!p2) { f2 = dnB === dG ? fr.v.C : fr.v.A; } if (dnA === dG && !(p1 && p1.rBoca)) od1 = fr.v.B; if (dnB === dG && !(p2 && p2.rBoca)) od2 = fr.v.B; }
        else real.pendente.push("joelho 90 de redução " + dG + "×" + dP + ": a ficha não traz; peça pelas faces da construção");
        b1 = dnA === c.dn ? b1 : pbTubo(G, dnA); b2 = dnB === c.dn ? b2 : pbTubo(G, dnB);
      }
      if (!p1 && !p2 && !f1) return null;
      pern = [pernaSold(G, dnA, f1, b1, od1), pernaSold(G, dnB, f2, b2, od2)];
      var ppC = cot.perfilMedido && G.perfilProduto ? G.perfilProduto("pvc_soldavel", tipo, c.dn) : null;
      if (ppC && ppC.tipo === "cotovelo" && dnA === dnB) { comPerfil(pern[0], ppC.pernas[0], ppC.rArco); comPerfil(pern[1], ppC.pernas[1] || ppC.pernas[0], ppC.rArco); real.rcPerfil = ppC.rcArco || ppC.rCentral; }
      real.fontes.push(cot.perfilMedido ? "face, bolsa e Ø da boca: perfil medido do produto (" + cot.perfilMedido + ")" : "face, bolsa e Ø da boca: " + (cot.fontes || []).join("; "));
    }
    real.fontes.push(FONTE_FAB + ": anel, corpo, chanfros, raio central, furo");
    var curva = /^curva/.test(tipo), rcA = curva ? (cot.R || cot.rCentral || fab(c.dn).rc * 3) : (real.rcPerfil || Math.max(pern[0].b.rC, pern[1].b.rC) * (fab(c.dn).rc / fab(c.dn).rC));
    var z1 = pern[0].face, z2 = pern[1].face, de = G.cotasTubo("pvc_soldavel", c.dn).de;
    var nArc = curva ? 24 : 10, cam = G.cotovelo(P, e1.dir, e2.dir, z1 * MM, z2 * MM, rcA * MM, lod === "longe" ? Math.PI / 4 : del / nArc * 1.0001);
    var L = cam.L / MM, Rb = cam.Rb / MM, tl = Rb * Math.tan(del / 2), l1 = z1 - tl, la = Rb * del, sMid = l1 + la / 2;
    var ext = juntar2(pernaExt(pern[0], lod), pernaExt(pern[1], lod), L, sMid), int = juntar2(pernaInt(pern[0], lod), pernaInt(pern[1], lod), L, sMid);
    var lp = escala(laco(ext, int));
    var segs = segsDe(lod, de, 2), partes, lim = teto(G, de);
    do { var m = new G.Malha(); G.varrer(m, cam, lp, segs, true); partes = [{ papel: "corpo", malha: m }]; segs -= 4; } while (tri(partes) > lim && segs >= 12 && lod !== "icone");
    real.marca = faixa(G, add(P, mul(e1.dir, z1 * MM)), mul(e1.dir, -1), pern[0].b.wA + 2, Math.max(pern[0].b.wA + 6, Math.min(pern[0].pb - 1, l1)), pern[0].b.rB, 1.6, textoMarca(cot.perfilMedido ? "fabricante" : "ficha", c.dn, rs ? rs.nome : null));
    return partes;
  }

  /* ---------------------------------------------- DERIVAÇÃO: tê, tê de redução, tê com rosca, tê com bucha de latão, cruzeta */
  function derivacaoReal(G, c, eixos, o, cot, portaDe, real) {
    if (eixos.length < 3) return null;
    var par = null, best = 1e9;
    for (var i = 0; i < eixos.length; i++) for (var j = i + 1; j < eixos.length; j++) { var dv = desvio(eixos[i].dir, eixos[j].dir); if (dv < best) { best = dv; par = [i, j]; } }
    var ea = eixos[par[0]], eb = eixos[par[1]], rams = eixos.filter(function (_, k) { return k !== par[0] && k !== par[1]; });
    var tipo = c.tipo, lod = o.lod, pa = portaDe(ea), pbp = portaDe(eb), de = G.cotasTubo("pvc_soldavel", c.dn).de, P = pv(c);
    var rs = null, fi = null;
    if (tipo === "te_rosca" || tipo === "te_bucha") {
      rs = rosca(chaveRosca(c)); fi = cotaFicha(tipo, c.dn, rs ? rs.nome : "");
      if (fi) real.fontes.push(FONTE_FICHA + ", pág. " + fi.pag + " (" + fi.k + "): " + fi.leitura); else real.pendente.push(tipo + " DN " + c.dn + ": a ficha não traz; faces da construção");
      if (rs) real.fontes.push("rosca " + rs.nome + "\" BSP (NBR 8133)");
    }
    var odL = pa && pa.rBoca ? 2 * pa.rBoca : cot.od;
    if (fi && !(pa && pa.rBoca)) odL = fi.v.B;
    var fa = pa ? pa.z / MM : (fi ? fi.v.A / 2 : (cot.zp || cot.zr)), fb = pbp ? pbp.z / MM : (fi ? fi.v.A / 2 : cot.zr);
    var la = pernaSold(G, c.dn, fa, pa ? pa.pb / MM : cot.pb, odL), lb = pernaSold(G, c.dn, fb, pbp ? pbp.pb / MM : cot.pb, pbp && pbp.rBoca ? 2 * pbp.rBoca : odL);
    real.fontes.push(cot.perfilMedido ? "faces e bolsas: perfil medido do produto (" + cot.perfilMedido + ")" : "faces e bolsas: " + (cot.fontes || []).join("; "));
    real.fontes.push(FONTE_FAB + ": anel, corpo, chanfros, furo");
    var ppD = cot.perfilMedido && pa && pa.rBoca && G.perfilProduto ? G.perfilProduto("pvc_soldavel", tipo, c.dn) : null, pdD = ppD && ppD.tipo === "derivacao" ? pernasDoPerfil(ppD) : null;
    if (pdD && pdD.linha.length === 2) { comPerfil(la, pdD.linha[0]); comPerfil(lb, pdD.linha[1]); }
    var L = fa + fb, partes = [], segs = segsDe(lod, de, eixos.length), lim = teto(G, de);
    var camL = G.reta(add(P, mul(ea.dir, fa * MM)), mul(ea.dir, -1));
    var lpL = escala(laco(juntar2(pernaExt(la, lod), pernaExt(lb, lod), L, fa), juntar2(pernaInt(la, lod), pernaInt(lb, lod), L, fa)));
    var pernasR = rams.map(function (er) {
      var pr = portaDe(er), dnR = er.dn || c.dn, odR, fR, bR;
      if (tipo === "te_reducao" && dnR < c.dn - 0.5) odR = cot.odb || odLuva(G, dnR); else odR = pr && pr.rBoca ? 2 * pr.rBoca : (dnR !== c.dn ? odLuva(G, dnR) : cot.od);
      fR = pr ? pr.z / MM : (cot.zb || cot.zr); bR = pr ? pr.pb / MM : pbTubo(G, dnR);
      if (fi && !pr) fR = fi.v.C - fi.v.B / 2;
      if (fi && !(pr && pr.rBoca)) odR = fi.v.B;
      var pe = pernaSold(G, dnR, fR, bR, odR);
      if (pdD && pr && pr.rBoca && pdD.ramal[0] && Math.abs(pdD.ramal[0].dn - dnR) < 0.5) comPerfil(pe, pdD.ramal[0]);
      if (tipo === "te_rosca" && rs) { pe.tipo = "roscaF"; pe.rosca = rs; pe.Lr = Math.min(bR, fR - la.b.rC - 1); pe.pb = pe.Lr; }
      if (tipo === "te_bucha" && rs) { pe.tipo = "latao"; pe.rosca = rs; pe.Lr = Math.min(bR, fR - la.b.rC - 1); pe.rL = Math.min(pe.b.rA - 1.6, rs.D / 2 + 1.1); }
      return { e: er, pe: pe };
    });
    var lpR = pernasR.map(function (q) {
      var s0 = Math.max(0.5, Math.min(la.b.furo, q.pe.b.rC) * 0.9), uS = q.pe.face - s0;
      var ex = ate(pernaExt(q.pe, lod), uS).map(function (x) { return [q.pe.face - x[0], x[1]]; }).reverse();
      var it = ate(pernaInt(q.pe, lod), uS).map(function (x) { return [q.pe.face - x[0], Math.min(x[1], q.pe.b.rC - 0.4)]; }).reverse();
      return { cam: G.reta(P, q.e.dir), lp: escala(laco(ex, it)), q: q };
    });
    do {
      partes = []; var m = new G.Malha(); G.varrer(m, camL, lpL, segs, true);
      lpR.forEach(function (r) { G.varrer(m, r.cam, r.lp, segs, true); });
      partes.push({ papel: tipo === "te_bucha" ? "azul" : "corpo", malha: m });
      segs -= 4;
    } while (tri(partes) > lim && segs >= 12 && lod !== "icone");
    segs += 4;
    lpR.forEach(function (r) { if (r.q.pe.tipo === "latao") partes.push(lataoParte(G, add(P, mul(r.q.e.dir, r.q.pe.face * MM)), mul(r.q.e.dir, -1), r.q.pe, lod, segs)); });
    real.marca = faixa(G, add(P, mul(ea.dir, fa * MM)), mul(ea.dir, -1), la.b.wA + 2, Math.max(la.b.wA + 6, la.pb - 1), la.b.rB, 1.5, textoMarca(cot.perfilMedido ? "fabricante" : "ficha", c.dn, rs ? rs.nome : null));
    return partes;
  }
  /* a BUCHA DE LATÃO rosqueada, aparente na boca (recuada 0,6 mm da face; a rosca fêmea com filetes) */
  function lataoParte(G, F, dIn, pe, lod, segs) {
    var rs = pe.rosca, rM = rs.D / 2, rm = rM - rs.h, u0 = 0.6, u1 = pe.Lr, ro = pe.rL - 0.05;
    var ext = [[u0 + 0.3, ro - 0.3], [u0 + 0.6, ro], [u1, ro]];
    var int = lod === "longe" ? [[u0, rm + 0.4], [u1, rm + 0.4]] : [[u0, rM]].concat(zigue(u0 + 0.6, u1 - 0.2, rm, rM, rs.p)).concat([[u1, rm]]);
    var lp = escala([[u0, Math.max(rm, ro - 0.6)]].concat(ext).concat([[u1, int[int.length - 1][1]]]).concat(int.slice().reverse()));
    var m = new G.Malha(); G.varrer(m, G.reta(F, dIn), lp, segs, true);
    return { papel: "latao", malha: m };
  }

  /* ---------------------------------------------- RETAS: luva, luva de correr, com rosca, com bucha, união, redução, bucha, curva de transposição */
  function retaReal(G, c, eixos, o, cot, portaDe, real) {
    var tipo = c.tipo, lod = o.lod, de = G.cotasTubo("pvc_soldavel", c.dn).de;
    if (eixos.length < 2) return null;
    var e1 = eixos[0], e2 = eixos[1], p1 = portaDe(e1), p2 = portaDe(e2), segs = segsDe(lod, de, 2), lim = teto(G, de), partes;
    if (Math.abs(dot(e1.dir, e2.dir) + 1) > 0.02 && tipo !== "curva_transposicao") return null;
    var pe1, pe2, L, extras = [], rs = null;
    if (tipo === "curva_transposicao") return transposicaoReal(G, c, eixos, o, cot, portaDe, real);
    if (tipo === "luva_rosca" || tipo === "luva_bucha") {
      rs = rosca(chaveRosca(c)); var fi = cotaFicha(tipo, c.dn, rs ? rs.nome : ""); if (!fi || !rs) return null;
      real.fontes.push(FONTE_FICHA + ", pág. " + fi.pag + " (" + fi.k + "): " + fi.leitura, "rosca " + rs.nome + "\" BSP (NBR 8133)");
      var iR = e1.lado === 0 ? 0 : 1, pbS = pbTubo(G, c.dn), Lr = Math.max(8, fi.v.A - pbS - 3);
      var pS = pernaSold(G, c.dn, 0, pbS, fi.v.B), pR = { tipo: tipo === "luva_rosca" ? "roscaF" : "latao", face: 0, pb: Lr, Lr: Lr, rosca: rs, b: bocaDe(G, c.dn, fi.v.B) };
      if (tipo === "luva_bucha") pR.rL = Math.min(pR.b.rA - 1.6, rs.D / 2 + 1.1);
      L = fi.v.A; pS.face = pR.face = L / 2; pe1 = iR ? pS : pR; pe2 = iR ? pR : pS;
    } else if (tipo === "uniao") {
      var f1 = p1 ? p1.z / MM : cot.L / 2, f2 = p2 ? p2.z / MM : cot.L / 2;
      pe1 = pernaSold(G, c.dn, f1, p1 ? p1.pb / MM : cot.pb, cot.od); pe2 = pernaSold(G, c.dn, f2, p2 ? p2.pb / MM : cot.pb, cot.od); L = f1 + f2;
      var U = FAB.uniao[String(c.dn)] || FAB.uniao["25"], rP = (cot.odPorca || 2 * U.rPorca) / 2, kU = rP / U.rPorca, wP = U.porcaL * kU;
      real.fontes.push("porca: Ø da ficha (B) e comprimento pela proporção do fabricante");
      extras.push(function (m, sg) { var C0 = add(add(pv(c), mul(e1.dir, (f1 - L / 2) * MM)), mul(e1.dir, wP * 0.5 * MM));
        prisma(G, m, C0, e2.dir, wP, rP, lod === "longe" ? 8 : 12, Math.min(2.5, U.ch * kU * 0.6), Math.PI / 12);
        G.varrer(m, G.reta(add(C0, mul(e2.dir, wP * MM)), e2.dir), escala([[0, pe1.b.rC], [0, rP * 0.86], [wP * 0.3 + 0.2, rP * 0.86], [wP * 0.3 + 0.2, pe1.b.rC]]), sg, true); });
    } else if (tipo === "luva_reducao" || tipo === "reducao" || tipo === "bucha" || tipo === "bucha_longa") {
      return reducaoReal(G, c, eixos, o, cot, portaDe, real);
    } else {   /* luva e luva de correr */
      var fa = p1 ? p1.z / MM : cot.L / 2, fb = p2 ? p2.z / MM : cot.L / 2;
      pe1 = pernaSold(G, c.dn, fa, p1 ? p1.pb / MM : cot.pb, cot.od); pe2 = pernaSold(G, c.dn, fb, p2 ? p2.pb / MM : cot.pb, cot.od); L = fa + fb;
      var ppL = tipo === "luva" && cot.perfilMedido && G.perfilProduto ? G.perfilProduto("pvc_soldavel", "luva", c.dn) : null;
      if (ppL && ppL.pernas && ppL.pernas.length) { comPerfil(pe1, ppL.pernas[0]); comPerfil(pe2, ppL.pernas[1] || ppL.pernas[0]); }
      if (tipo === "luva_correr") {   /* o anel de borracha de vedação na boca (dois, um em cada ponta) — aparente */
        var ab = [Math.max(pe1.b.wA * 0.4, 2.5), Math.max(pe1.b.wA * 0.4, 2.5) + Math.max(2.2, 0.08 * de), Math.max(1, 0.05 * de)];
        pe1.anelBorracha = ab; pe2.anelBorracha = ab;
        real.fontes.push("anéis de vedação: forma de desenho (a ficha mostra os anéis; sem cota)");
      }
      real.fontes.push(cot.perfilMedido ? "faces: perfil medido (" + cot.perfilMedido + ")" : "faces: " + (cot.fontes || []).join("; "));
    }
    real.fontes.push(FONTE_FAB);
    var P0 = add(pv(c), mul(e1.dir, pe1.face * MM)), cam = G.reta(P0, mul(e1.dir, -1));
    var lp = escala(laco(juntar2(pernaExt(pe1, lod), pernaExt(pe2, lod), L, pe1.face), juntar2(pernaInt(pe1, lod), pernaInt(pe2, lod), L, pe1.face)));
    do {
      var m = new G.Malha(); G.varrer(m, cam, lp, segs, true); extras.forEach(function (f) { f(m, segs); });
      partes = [{ papel: tipo === "luva_bucha" ? "azul" : "corpo", malha: m }]; segs -= 4;
    } while (tri(partes) > lim && segs >= 12 && lod !== "icone");
    segs += 4;
    [[pe1, e1, mul(e1.dir, -1), pe1.face], [pe2, e2, mul(e2.dir, -1), pe2.face]].forEach(function (q) {
      if (q[0].tipo === "latao") partes.push(lataoParte(G, add(pv(c), mul(q[1].dir, q[3] * MM)), q[2], q[0], lod, segs));
      if (q[0].anelBorracha && lod !== "longe") { var ab2 = q[0].anelBorracha, ma = new G.Malha(), rI = q[0].b.rIn;
        G.varrer(ma, G.reta(add(pv(c), mul(q[1].dir, q[3] * MM)), q[2]), escala([[ab2[0] + 0.15, rI - 0.35], [ab2[0] + 0.15, rI + ab2[2] - 0.1], [ab2[1] - 0.15, rI + ab2[2] - 0.1], [ab2[1] - 0.15, rI - 0.35]]), segs, true);
        partes.push({ papel: "anel", malha: ma }); }
    });
    real.marca = faixa(G, P0, mul(e1.dir, -1), L * 0.32, L * 0.68, Math.min(pe1.b.rC, pe2.b.rC), 1.4, textoMarca(cot.perfilMedido ? "fabricante" : "ficha", c.dn, rs ? rs.nome : null));
    return partes;
  }
  /* LUVA DE REDUÇÃO (duas bolsas), BUCHA CURTA (por dentro da bolsa maior: externo = DE maior, bolsa menor dentro) e BUCHA LONGA
     (ponta no DE maior + corpo + bolsa menor) */
  function reducaoReal(G, c, eixos, o, cot, portaDe, real) {
    var tipo = c.tipo, lod = o.lod, e1 = eixos[0], e2 = eixos[1], gE = (e1.dn || 0) >= (e2.dn || 0) ? e1 : e2, pE = gE === e1 ? e2 : e1;
    var dG = gE.dn || c.dn, dP = pE.dn || c.dn2; if (!(dG > dP)) return null;
    var pg = portaDe(gE), pp = portaDe(pE), deG = G.cotasTubo("pvc_soldavel", dG).de, partes, segs = segsDe(lod, deG, 2), lim = teto(G, deG);
    var peG, peP, L, sMid;
    if (tipo === "luva_reducao" || tipo === "reducao") {
      var fg = pg ? pg.z / MM : cot.L / 2, fp = pp ? pp.z / MM : cot.L / 2;
      peG = pernaSold(G, dG, fg, pg ? pg.pb / MM : pbTubo(G, dG), cot.od); peP = pernaSold(G, dP, fp, pp ? pp.pb / MM : pbTubo(G, dP), cot.od2 || odLuva(G, dP));
      L = fg + fp; sMid = fg + (peG.pb - fg + (L - peP.pb - fg)) / 2; sMid = Math.max(peG.pb + 1, Math.min(L - peP.pb - 1, (peG.pb + L - peP.pb) / 2));
      real.fontes.push("faces e bolsas: " + (cot.fontes || []).join("; ") || "construção");
    } else {
      var fl = tipo === "bucha_longa" ? cotaFicha("bucha_longa", dG, String(dP)) : null; fl = fl && fl.k === dG + "x" + dP ? fl : null;
      var Lt = tipo === "bucha" ? (cot.L || pbTubo(G, dP) + 2.5) : (fl ? fl.v.A : pbTubo(G, dP) + pbTubo(G, dG) + 6);
      if (tipo === "bucha_longa" && !fl) real.pendente.push("bucha longa " + dG + "×" + dP + ": a ficha não traz; comprimento pelas bolsas (desenho)");
      if (fl) real.fontes.push(FONTE_FICHA + ", pág. " + fl.pag + " (" + fl.k + "): " + fl.leitura);
      var tbG = G.cotasTubo("pvc_soldavel", dG);
      if (tipo === "bucha") {   /* um cilindro no DE maior com a bolsa menor por dentro e o colarinho na boca */
        var bP = bocaDe(G, dP, odLuva(G, dP)), rO = deG / 2, pbP = Math.min(pbTubo(G, dP), Lt - 1.5);
        var ext = [[0, rO + 0.6], [1.2, rO + 0.6], [1.4, rO], [Lt - 0.8, rO], [Lt, rO - 0.8]], int = [[0, bP.rIn + 0.4], [0.5, bP.rIn], [pbP, bP.rIn], [pbP, bP.furo], [Lt, bP.furo]];
        var F0 = add(pv(c), mul(pE.dir, (pp ? pp.z / MM : Lt) * MM));
        var m0 = new G.Malha(); G.varrer(m0, G.reta(F0, mul(pE.dir, -1)), escala(laco(ext, int)), segs, true);
        real.fontes.push("bucha curta: comprimento da ficha (L), externo = DE " + dG + " (entra na bolsa), bolsa " + dP + " da norma");
        return [{ papel: "corpo", malha: m0 }];
      }
      var bP2 = bocaDe(G, dP, fl ? fl.v.B : odLuva(G, dP)), Lp = Math.min(pbTubo(G, dG), Lt * 0.5);
      peP = { tipo: "sold", face: 0, pb: pbTubo(G, dP), b: bP2 }; peG = { tipo: "ponta", face: 0, Lp: Lp, de: deG, e: tbG.e, b: bP2 };
      L = Lt; sMid = L - Lp - 0.01;
      var F1 = add(pv(c), mul(pE.dir, (pp ? pp.z / MM : L) * MM));
      var extL = juntar2(pernaExt(peP, lod), pernaExt(peG, lod), L, L - Lp), intL = juntar2(pernaInt(peP, lod), pernaInt(peG, lod), L, L - Lp);
      /* a transição do corpo menor para a ponta (cone curto) */
      var m1 = new G.Malha(); G.varrer(m1, G.reta(F1, mul(pE.dir, -1)), escala(laco(extL, intL)), segs, true);
      return [{ papel: "corpo", malha: m1 }];
    }
    var P0 = add(pv(c), mul(gE.dir, peG.face * MM)), cam = G.reta(P0, mul(gE.dir, -1));
    var lp = escala(laco(juntar2(pernaExt(peG, lod), pernaExt(peP, lod), L, sMid), juntar2(pernaInt(peG, lod), pernaInt(peP, lod), L, sMid)));
    do { var m = new G.Malha(); G.varrer(m, cam, lp, segs, true); partes = [{ papel: "corpo", malha: m }]; segs -= 4; } while (tri(partes) > lim && segs >= 12 && lod !== "icone");
    real.marca = faixa(G, P0, mul(gE.dir, -1), peG.b.wA + 2, Math.max(peG.b.wA + 5, peG.pb - 1), peG.b.rB, 1.4, textoMarca("ficha", dG + "x" + dP, null));
    return partes;
  }
  /* CURVA DE TRANSPOSIÇÃO: as bolsas nas pontas, em linha, e o arco em "S" por cima do tubo cruzado (o caminho da construção) */
  function transposicaoReal(G, c, eixos, o, cot, portaDe, real) {
    var lod = o.lod, e1 = eixos[0], e2 = eixos[1], p1 = portaDe(e1), p2 = portaDe(e2), de = G.cotasTubo("pvc_soldavel", c.dn).de;
    var Lt = (p1 ? p1.z / MM : cot.L / 2) + (p2 ? p2.z / MM : cot.L / 2), pb = p1 ? p1.pb / MM : cot.pb;
    var axT = nrmz(sub(e2.dir, e1.dir)), upT = Math.abs(axT[1]) < 0.9 ? [0, 1, 0] : perpDe(axT);
    if (o.cima) { var cu = pv(o.cima), cq = sub(cu, mul(axT, dot(cu, axT))); if (Math.sqrt(dot(cq, cq)) > 0.5) upT = nrmz(cq); }   /* o lado do arco (por cima do tubo cruzado) */
    var sideT = nrmz(cross(axT, upT));
    /* a peça de verdade é TUBO (Ø D + parede) dobrado, com as bolsas no Ø B da ficha; a crista a R + D/2 (o raio lido) */
    var rT = (cot.od != null ? Math.min(cot.od / 2 - 1.2, de / 2 + 1.6) : de / 2 + 1.6), Ht = (cot.R != null ? cot.R : de) + de / 2;
    var Fa0 = add(pv(c), mul(e1.dir, (Lt / 2) * MM)), s0 = (pb + 4) * MM, s1 = (Lt - pb - 4) * MM, est = [], n = lod === "longe" ? 6 : 24;
    for (var i = 0; i <= n; i++) est.push(s0 + (s1 - s0) * i / n);
    var cam = { estacoes: est, em: function (s) {
      var uu = s <= s0 ? 0 : (s >= s1 ? 1 : (s - s0) / (s1 - s0)), h = Ht * MM * (1 - Math.cos(2 * Math.PI * uu)) / 2, dh = uu <= 0 || uu >= 1 ? 0 : Ht * MM * Math.PI * Math.sin(2 * Math.PI * uu) / (s1 - s0);
      var tt = nrmz(add(axT, mul(upT, dh))); return { p: add(add(Fa0, mul(axT, s)), mul(upT, h)), t: tt, u: sideT, v: cross(tt, sideT) }; } };
    var b = bocaDe(G, c.dn, cot.od || odLuva(G, c.dn)), pe = { tipo: "sold", face: 0, pb: pb, b: b };
    b.rC = Math.min(b.rC, rT); var ext = juntar2(pernaExt(pe, lod), pernaExt(pe, lod), Lt, Lt / 2), int = juntar2(pernaInt(pe, lod), pernaInt(pe, lod), Lt, Lt / 2);
    int = int.map(function (q) { return [q[0], Math.min(q[1], rT - 1.2)]; });
    var segs = segsDe(lod, de, 2), lim = teto(G, de), lpT = escala(laco(ext, int)), m;
    do { m = new G.Malha(); G.varrer(m, cam, lpT, segs, true); segs -= 4; } while (m.idx.length / 3 > lim && segs >= 12 && lod !== "icone");
    real.fontes.push(FONTE_FICHA + ", pág. 17: A meio comprimento, B Ø da bolsa, R raio do arco; C (altura do arco) pendente na tabela");
    real.pendente.push("curva de transposição: altura C do arco não está na tabela da ficha (crista a R + D/2)");
    return [{ papel: "corpo", malha: m }];
  }

  /* ================================================ PEÇAS DE PONTO (pecaSimples): cap, adaptador curto, luva de correr, joelho e luva
     azuis com bucha de latão, adaptador de caixa d'água. F = a face da boca soldável, dir = para DENTRO da peça. */
  function simples(G, tipo, material, dn, F, dir, o) {
    o = o || {};
    if (desligado() || material !== "pvc_soldavel" || !/^(cap|adaptador|luva_correr|joelho_bucha|luva_bucha|adaptador_caixa)$/.test(tipo)) return null;
    /* FASE 2 (07/11/2026): a medida TIGRE quando há (a peça de ponto se posiciona por pontoAgua) */
    var tgS = null; try { tgS = simplesTigre(G, tipo, dn, pv(F), nrmz(pv(dir)), o); } catch (eS) { tgS = null; }
    if (tgS) { if (o.marcacao && tgS.marca) tgS.partes.push(tgS.marca); var cS = tgS.cotas; cS.tipo = tipo; cS.dn = dn; cS.real = { fonte: "Tigre", fontes: [cS.fonteReal], pendente: [] }; return { partes: tgS.partes, cotas: cS, aConferir: false, real: true, fonte: "Tigre" }; }
    var oo = {}; Object.keys(o).forEach(function (k) { oo[k] = o[k]; }); oo.semReal = true;
    var base = null; if (tipo !== "adaptador_caixa") { try { base = G.pecaSimples(tipo, material, dn, F, dir, oo); } catch (e) { base = null; } if (!base) return null; }
    var d = nrmz(pv(dir)), Fv = pv(F), lod = o.lod, de = G.cotasTubo("pvc_soldavel", dn).de, segs = segsDe(lod, de, 2), real = { fontes: [], pendente: [] }, partes = [];
    var cot = base ? base.cotas : { de: de, pb: pbTubo(G, dn), origem: {}, fontes: [] }, pbS = pbTubo(G, dn);
    var C = (G.dados ? G.dados() : {}).conexoes || {}, reg = (C.pvc_soldavel || {})[tipo] || {};
    var kR = Object.keys(reg).filter(function (x) { return x.split("x")[0] === String(dn); })[0], rg = kR ? reg[kR] : null;
    if (tipo === "cap") {
      var b = bocaDe(G, dn, cot.od), L = cot.L, ed = Math.min(L - pbS - 0.5, Math.max(1.5, (L - pbS) * 0.7)), rr = Math.min(b.rC * 0.35, (L - pbS) * 0.9);
      var ext = pernaExt({ tipo: "sold", pb: pbS, b: b }, lod).filter(function (q) { return q[0] < L - rr - 0.2; });
      ext.push([L - rr, b.rC]); for (var k = 1; k <= 5; k++) { var a = Math.PI / 2 * k / 5; ext.push([L - rr + rr * Math.sin(a), b.rC - rr + rr * Math.cos(a)]); }
      ext.push([L, 0]);
      var int = [[0, b.rIn + 0.5], [0.5, b.rIn], [pbS, b.rIn], [pbS + 0.0001, 0]];
      void ed;
      var m = new G.Malha(); G.varrer(m, G.reta(Fv, d), escala(ext.concat(int.slice().reverse())), segs, true); partes.push({ papel: "corpo", malha: m });
      real.fontes.push("comprimento e Ø: " + ((cot.fontes || []).join("; ") || "construção"), FONTE_FAB);
      real.marca = faixa(G, Fv, d, b.wA + 2, Math.max(b.wA + 5, pbS - 1), b.rB, 1.4, textoMarca("ficha", dn, null));
    } else if (tipo === "luva_correr") {
      var bc = bocaDe(G, dn, cot.od), Lc = cot.L, pe = { tipo: "sold", pb: pbS, b: bc, anelBorracha: [Math.max(bc.wA * 0.4, 2.5), Math.max(bc.wA * 0.4, 2.5) + Math.max(2.2, 0.08 * de), Math.max(1, 0.05 * de)] };
      var m2 = new G.Malha(), cam = G.reta(Fv, d);
      G.varrer(m2, cam, escala(laco(juntar2(pernaExt(pe, lod), pernaExt(pe, lod), Lc, Lc / 2), juntar2(pernaInt(pe, lod), pernaInt(pe, lod), Lc, Lc / 2))), segs, true);
      partes.push({ papel: "corpo", malha: m2 });
      if (lod !== "longe") [[Fv, d], [add(Fv, mul(d, Lc * MM)), mul(d, -1)]].forEach(function (q) { var ab = pe.anelBorracha, ma = new G.Malha(), rI = bc.rIn;
        G.varrer(ma, G.reta(q[0], q[1]), escala([[ab[0] + 0.15, rI - 0.35], [ab[0] + 0.15, rI + ab[2] - 0.1], [ab[1] - 0.15, rI + ab[2] - 0.1], [ab[1] - 0.15, rI - 0.35]]), segs, true); partes.push({ papel: "anel", malha: ma }); });
      real.fontes.push("comprimento e Ø: " + ((cot.fontes || []).join("; ") || "construção"), FONTE_FAB, "anéis de vedação: forma de desenho");
      real.marca = faixa(G, Fv, d, Lc * 0.34, Lc * 0.66, bc.rC, 1.4, textoMarca("ficha", dn, null));
    } else if (tipo === "adaptador") {
      var rsA = rosca(rg ? rg.rosca : ROSCA_DN[dn]), La = rg ? rg.L : (base.cotas.L || 2 * pbS), ba = bocaDe(G, dn, cot.od);
      if (!rsA) return null;
      var col = Math.max(2, 0.08 * de), Lr = Math.max(6, La - pbS - col - 1.5);
      var ps = { tipo: "sold", pb: pbS, b: ba }, pr = { tipo: "roscaM", Lr: Lr, rosca: rsA, furo: Math.min(ba.furo, rsA.D / 2 - rsA.h - 1.6) };
      /* bolsa → colar (o anel saliente entre a bolsa e a rosca) → rosca macho até a ponta */
      var extA = pernaExt(ps, lod).filter(function (q) { return q[0] < pbS - 0.3; });
      var sCol = pbS + 0.6; extA.push([sCol, ba.rB], [sCol + 0.4, ba.rA], [sCol + col, ba.rA], [sCol + col + 0.6, Math.max(rsA.D / 2, ba.rC * 0.92)]);
      pernaExt(pr, lod).slice().reverse().forEach(function (q) { extA.push([La - q[0], q[1]]); });
      extA = extA.filter(function (q, i, l) { return i === 0 || q[0] >= l[i - 1][0] - 1e-9; });
      var intA = [[0, ba.rIn + 0.5], [0.5, ba.rIn], [pbS, ba.rIn], [pbS, pr.furo], [La, pr.furo]];
      var m3 = new G.Malha(); G.varrer(m3, G.reta(Fv, d), escala(laco(extA, intA)), segs, true); partes.push({ papel: "corpo", malha: m3 });
      real.fontes.push(FONTE_FICHA + ", pág. 10: L e Ø da bolsa", "rosca macho " + rsA.nome + "\" BSP (NBR 8133)", FONTE_FAB, "colar entre a bolsa e a rosca: forma de desenho");
      real.marca = faixa(G, Fv, d, ba.wA + 1.5, Math.max(ba.wA + 4, pbS - 1), ba.rB, 1.4, textoMarca("ficha", dn, rsA.nome));
    } else if (tipo === "luva_bucha") {
      var rsL = rosca(chaveRosca({ dn: dn, rosca: o.rosca || (dn === 32 ? "1" : "1/2") })), fiL = cotaFicha("luva_bucha", dn, rsL ? rsL.nome : "");
      if (!rsL || !fiL) return null;
      var Lb = base.cotas.L || fiL.v.A;   /* ⚠ o comprimento é o da construção (o ponto de água posiciona a peça por ele); a ficha fica na divergência */
      if (Math.abs(Lb - fiL.v.A) > 0.5) real.pendente.push("comprimento " + Lb + " mm (posição do ponto de água) × A = " + fiL.v.A + " mm da ficha — corrigir junto com a porta");
      var bL = bocaDe(G, dn, fiL.v.B), peS = { tipo: "sold", pb: pbS, b: bL }, peR = { tipo: "latao", pb: 0, Lr: Math.max(8, Math.min(Lb - pbS - 3, fiL.v.A - pbS - 3)), rosca: rsL, b: bL };
      peR.pb = peR.Lr; peR.rL = Math.min(bL.rA - 1.6, rsL.D / 2 + 1.1);
      var m4 = new G.Malha(); G.varrer(m4, G.reta(Fv, d), escala(laco(juntar2(pernaExt(peS, lod), pernaExt(peR, lod), Lb, pbS + 1), juntar2(pernaInt(peS, lod), pernaInt(peR, lod), Lb, pbS + 1))), segs, true);
      partes.push({ papel: "azul", malha: m4 }); partes.push(lataoParte(G, add(Fv, mul(d, Lb * MM)), mul(d, -1), peR, lod, segs));
      real.fontes.push(FONTE_FICHA + ", pág. " + fiL.pag + " (" + fiL.k + "): " + fiL.leitura, "rosca " + rsL.nome + "\" BSP (NBR 8133)", FONTE_FAB);
      real.marca = faixa(G, Fv, d, bL.wA + 1.5, Math.max(bL.wA + 4, pbS - 1), bL.rB, 1.4, textoMarca("ficha", dn, rsL.nome));
    } else if (tipo === "joelho_bucha") {
      /* o joelho azul: a perna soldável na face F (como sempre) e a de rosca na saída; faces da construção */
      var saida = o.saida ? nrmz(pv(o.saida)) : perpDe(d), ppA = G.perfilProduto(material, "joelho_bucha", dn), rsJ = rosca((rg && rg.rosca) || "1/2");
      var zS = ppA ? (ppA.pernas.filter(function (x) { return String(x.id) !== "2"; })[0] || ppA.pernas[0]).face : (rg ? rg.z : null);
      var pR2 = ppA ? (ppA.pernas.filter(function (x) { return String(x.id) === "2"; })[0] || ppA.pernas[1]) : null, zR = pR2 ? pR2.face : (rg ? Math.max(rg.zr, rg.z) : null);
      if (zS == null || zR == null || !rsJ) return null;
      var odJ = ppA ? 2 * (pR2.ext[pR2.ext.length - 1][1]) : (rg ? rg.od : cot.od), V0 = add(Fv, mul(d, zS * MM));
      var pS2 = pernaSold(G, dn, zS, pbS, ppA ? 2 * (ppA.pernas.filter(function (x) { return String(x.id) !== "2"; })[0] || ppA.pernas[0]).ext.slice(-1)[0][1] : odJ);
      var pJ = { tipo: "latao", face: zR, pb: 0, Lr: Math.max(7, Math.min(zR - fab(dn).rc * 0.9, pbS)), rosca: rsJ, b: bocaDe(G, dn, odJ) };
      pJ.pb = pJ.Lr; pJ.rL = Math.min(pJ.b.rA - 1.6, rsJ.D / 2 + 1.1);
      if (ppA) { comPerfil(pS2, ppA.pernas.filter(function (x) { return String(x.id) !== "2"; })[0] || ppA.pernas[0], ppA.rArco); comPerfil(pJ, pR2, ppA.rArco); }
      var del = Math.PI / 2, rc = ppA ? (ppA.rcArco || ppA.rCentral) : Math.max(pS2.b.rC, pJ.b.rC) * (fab(dn).rc / fab(dn).rC);
      var camJ = G.cotovelo(V0, mul(d, -1), saida, zS * MM, zR * MM, rc * MM, lod === "longe" ? Math.PI / 4 : del / 10 * 1.0001);
      var Lj = camJ.L / MM, Rb = camJ.Rb / MM, sM = zS - Rb + Rb * del / 2;
      var m5 = new G.Malha(); G.varrer(m5, camJ, escala(laco(juntar2(pernaExt(pS2, lod), pernaExt(pJ, lod), Lj, sM), juntar2(pernaInt(pS2, lod), pernaInt(pJ, lod), Lj, sM))), segs, true);
      partes.push({ papel: "azul", malha: m5 }); partes.push(lataoParte(G, add(V0, mul(saida, zR * MM)), mul(saida, -1), pJ, lod, segs));
      real.fontes.push(ppA ? "faces: perfil medido do produto (" + ppA.familia + ")" : FONTE_FICHA + ", pág. 21", "rosca " + rsJ.nome + "\" BSP (NBR 8133)", FONTE_FAB);
      real.marca = faixa(G, Fv, d, pS2.b.wA + 1.5, Math.max(pS2.b.wA + 4, pbS - 1), pS2.b.rB, 1.4, textoMarca(ppA ? "fabricante" : "ficha", dn, rsJ.nome));
    } else if (tipo === "adaptador_caixa") {
      var rsK = rosca(o.rosca || ROSCA_DN[dn]), fk = cotaFicha("adaptador_caixa", dn, rsK ? rsK.nome : "");
      if (!rsK || !fk) return null;
      var A = fk.v.A, Bf = fk.v.B, bK = bocaDe(G, dn, odLuva(G, dn)), rRm = rsK.D / 2, rCorpoK = Math.max(bK.rA, rRm + 1);
      /* bolsa soldável (lado de fora da caixa) → flange (Ø B) → corpo com a rosca macho por onde corre a PORCA → boca de rosca fêmea */
      var eF = Math.max(3, 0.05 * Bf), sF = A * 0.36, rFl = Bf / 2;
      var rMK = Math.max(rCorpoK + 1.5, de / 2 + 4), Dmk = rosca(ROSCA_DN[dn]) || rsK;
      var extK = [[0, bK.rA - 0.5], [0.5, bK.rA], [sF - 1.2, bK.rA], [sF - 0.6, rFl - 1], [sF, rFl], [sF + eF - 0.5, rFl], [sF + eF, rFl - 1.5], [sF + eF + 0.6, rMK]];
      var sP = sF + eF + 3, wPk = Math.max(8, A * 0.18);
      if (lod !== "longe") extK = extK.concat(zigue(sP + wPk + 0.5, A - 2, rMK - 0.9, rMK, Dmk.p));
      extK.push([A - 1, rMK - 0.4], [A, rMK - 1.2]);
      var rFk = rsK.D / 2, rmK = rFk - rsK.h, intK = [[0, bK.rIn + 0.5], [0.5, bK.rIn], [pbS, bK.rIn], [pbS, Math.min(bK.furo, rmK - 0.8)], [A - Math.min(A * 0.3, 18), Math.min(bK.furo, rmK - 0.8)], [A - Math.min(A * 0.3, 18), rmK]];
      if (lod !== "longe") intK = intK.concat(zigue(A - Math.min(A * 0.3, 18) + 0.5, A - 0.6, rmK, rFk, rsK.p).reverse().reverse());
      intK.push([A, rFk + 0.3]);
      var m6 = new G.Malha(); G.varrer(m6, G.reta(Fv, d), escala(laco(extK, intK)), segs, true); partes.push({ papel: "corpo", malha: m6 });
      /* o anel de vedação preto encostado na flange (lado da caixa) e a PORCA sextavada com nervuras */
      var mA = new G.Malha(); G.varrer(mA, G.reta(add(Fv, mul(d, (sF + eF) * MM)), d), escala([[0, rMK + 0.3], [0, rFl * 0.78], [2.2, rFl * 0.78], [2.2, rMK + 0.3]]), segs, true); partes.push({ papel: "anel", malha: mA });
      var mP = new G.Malha(); prisma(G, mP, add(Fv, mul(d, (sP + 2.4) * MM)), d, wPk, Math.max(rMK + 4, rFl * 0.82), lod === "longe" ? 8 : 16, 1.2, 0);
      partes.push({ papel: "corpo", malha: mP });
      real.fontes.push(FONTE_FICHA + ", pág. " + fk.pag + " (" + fk.k + "): " + fk.leitura, "rosca " + rsK.nome + "\" BSP (NBR 8133)");
      real.pendente.push("adaptador de caixa d'água: posição da flange, Ø e largura da porca e anel de vedação sem cota na ficha (forma de desenho)");
      cot = { tipo: "adaptador_caixa", dn: dn, de: de, pb: pbS, L: A, od: odLuva(G, dn), odFlange: Bf, rosca: rsK.nome, origem: { L: "catalogo", odFlange: "catalogo" }, fontes: [FONTE_FICHA + ", pág. 9"], aConferir: true };
      real.marca = faixa(G, Fv, d, 1, Math.max(4, sF - 2), bK.rA, 1.2, textoMarca("ficha", dn, rsK.nome));
    }
    if (!partes.length) return null;
    if (o.marcacao && real.marca) partes.push(real.marca);
    var ct = {}; Object.keys(cot || {}).forEach(function (k) { ct[k] = cot[k]; }); ct.real = real;
    return { partes: partes, cotas: ct, aConferir: !!(base && base.aConferir) || real.pendente.length > 0, real: true };
  }

  /* REALISMO por tipo (GERADO por tools/hid-cx-bancada-agua.js --gravar): "ok" = silhueta ≥ 0,97 nas 3 vistas contra o gabarito do
     fabricante em todo DN medido — o render nosso pode ir para livro/ícone; "foto" = ainda não: livro e ícone usam a FOTO do catálogo
     (foto + origem + motivo). Pedido do Rogério (06/11/2026): "enquanto não estiver 99,9 %, use a foto do catálogo". */
  /* PERFIS-TIGRE-INICIO (GERADO por tools/gerar-hid-real-agua-tigre.js — não editar à mão) */
  var TIGRE = {"joelho90-20":{"fam":"AF_Soldavel_Joelho 45_90","forma":"cotovelo","dn":20,"codigo":"22150200","descricao":"Joelho 90º Soldável 20mm, PVC Marrom, Água Fria - TIGRE","furo":8.5,"rc":11.8,"rC":11.55,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":20,"conector":12.7,"face":29.1,"ext":[[10.62,11.48],[11.87,11.61],[12.62,12.33],[12.87,12.4],[23.62,12.4],[23.87,12.47],[25.62,14.3],[28.87,14.29],[29.1,14.29]]},{"id":1,"d":[-1,0,0],"dn":20,"conector":12.7,"face":29.1,"ext":[[10.62,11.48],[11.87,11.61],[12.62,12.33],[12.87,12.4],[23.62,12.4],[23.87,12.47],[25.62,14.3],[28.87,14.29],[29.1,14.29]]}],"eOut":5.86,"rcMed":15.59,"rArcoMed":12.32,"rcMedC":13.73,"dn2":0},"joelho90-25":{"fam":"AF_Soldavel_Joelho 45_90","forma":"cotovelo","dn":25,"codigo":"22150251","descricao":"Joelho 90º Soldável 25mm, PVC Marrom, Água Fria - TIGRE","furo":10.8,"rc":14.3,"rC":14.04,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":25,"conector":15.4,"face":33.5,"ext":[[12.87,14],[14.37,14.11],[15.37,15.08],[27.87,15.1],[28.12,15.12],[29.62,16.49],[33.37,16.5],[33.5,16.5]]},{"id":1,"d":[-1,0,0],"dn":25,"conector":15.4,"face":33.5,"ext":[[12.87,13.99],[14.37,14.11],[15.37,15.08],[27.87,15.1],[28.12,15.12],[29.62,16.49],[33.37,16.5],[33.5,16.5]]}],"eOut":7.67,"rcMed":17.85,"rArcoMed":15.06,"rcMedC":15.37,"dn2":0},"joelho90-32":{"fam":"AF_Soldavel_Joelho 45_90","forma":"cotovelo","dn":32,"codigo":"22150324","descricao":"Joelho 90º Soldável 32mm, PVC Marrom, Água Fria - TIGRE","furo":13.9,"rc":18.2,"rC":18,"angulo":90,"pernas":[{"id":1,"d":[-1,0,0],"dn":32,"conector":19.5,"face":40.3,"ext":[[16.38,17.94],[18.13,18],[19.63,19],[31.63,19],[31.88,19.08],[34.38,21.49],[40.13,21.5],[40.3,21.5]]},{"id":2,"d":[0,0,-1],"dn":32,"conector":19.5,"face":40.3,"ext":[[16.38,17.95],[18.13,18],[19.63,19],[31.63,19],[31.88,19.08],[34.38,21.49],[40.13,21.49],[40.3,21.49]]}],"eOut":9.88,"rcMed":21.95,"rArcoMed":18.97,"rcMedC":19.61,"dn2":0},"joelho90-40":{"fam":"AF_Soldavel_Joelho 45_90","forma":"cotovelo","dn":40,"codigo":"22150405","descricao":"Joelho 90º Soldável 40mm, PVC Marrom, Água Fria - TIGRE","furo":17.6,"rc":21.9,"rC":21.65,"angulo":90,"pernas":[{"id":1,"d":[-1,0,0],"dn":40,"conector":23.5,"face":48,"ext":[[19.71,21.58],[21.96,21.71],[23.46,23.16],[23.71,23.2],[38.21,23.21],[40.96,25.96],[47.96,26],[48,26]]},{"id":2,"d":[0,0,-1],"dn":40,"conector":23.5,"face":48,"ext":[[19.71,21.59],[21.96,21.71],[23.46,23.16],[23.71,23.19],[38.21,23.21],[40.96,25.96],[47.96,25.99],[48,25.99]]}],"eOut":11.88,"rcMed":27.1,"rArcoMed":23.1,"rcMedC":23.59,"dn2":0},"joelho90-50":{"fam":"AF_Soldavel_Joelho 45_90","forma":"cotovelo","dn":50,"codigo":"22150502","descricao":"Joelho 90º Soldável 50mm, PVC Marrom, Água Fria - TIGRE","furo":22,"rc":27.4,"rC":27.15,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":50,"conector":29.1,"face":59.6,"ext":[[24.66,27.06],[27.41,27.15],[29.16,28.65],[48.91,28.64],[52.16,30.75],[59.41,30.74],[59.6,30.74]]},{"id":1,"d":[-1,0,0],"dn":50,"conector":29.1,"face":59.6,"ext":[[24.66,27.07],[27.41,27.16],[29.16,28.65],[48.91,28.64],[52.16,30.75],[59.41,30.75],[59.6,30.75]]}],"eOut":15.8,"rcMed":27.43,"rArcoMed":27.16,"rcMedC":27.41,"dn2":0},"joelho90-60":{"fam":"AF_Soldavel_Joelho 45_90","forma":"cotovelo","dn":60,"codigo":"22150600","descricao":"Joelho 90º Soldável 60mm, PVC Marrom, Água Fria - TIGRE","furo":26.7,"rc":32.4,"rC":32.15,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":60,"conector":34.6,"face":67.3,"ext":[[29.16,32.05],[32.41,32.16],[34.66,34.29],[55.41,34.29],[55.66,34.36],[59.41,37.99],[67.16,38],[67.3,38]]},{"id":1,"d":[-1,0,0],"dn":60,"conector":34.6,"face":67.3,"ext":[[29.16,32.05],[32.41,32.16],[34.66,34.3],[55.41,34.29],[55.66,34.36],[59.41,38],[67.16,38],[67.3,38]]}],"eOut":18.72,"rcMed":32.45,"rArcoMed":32.16,"rcMedC":32.41,"dn2":0},"joelho90-75":{"fam":"AF_Soldavel_Joelho 45_90","forma":"cotovelo","dn":75,"codigo":"22150758","descricao":"Joelho 90º Soldável 75mm, PVC Marrom, Água Fria - TIGRE","furo":33.3,"rc":35.2,"rC":35,"angulo":90,"pernas":[{"id":1,"d":[-1,0,0],"dn":75,"conector":37.7,"face":81,"ext":[[31.68,34.89],[35.18,35],[37.68,39.96],[68.68,40],[72.68,42.99],[80.93,42.99],[81,42.99]]},{"id":2,"d":[0,0,-1],"dn":75,"conector":37.7,"face":81,"ext":[[31.68,34.89],[35.18,35],[37.68,39.96],[68.68,40],[72.68,42.99],[80.93,42.99],[81,42.99]]}],"eOut":20.42,"rcMed":35.21,"rArcoMed":35,"rcMedC":35.2,"dn2":0},"joelho90-85":{"fam":"AF_Soldavel_Joelho 45_90","forma":"cotovelo","dn":85,"codigo":"22150855","descricao":"Joelho 90º Soldável 85mm, PVC Marrom, Água Fria - TIGRE","furo":37.8,"rc":41.3,"rC":41,"angulo":90,"pernas":[{"id":1,"d":[-1,0,0],"dn":85,"conector":43.9,"face":91.05,"ext":[[37.17,40.88],[41.17,40.99],[41.42,41.18],[43.92,45],[77.92,45.01],[82.42,48],[90.92,47.99],[91.05,47.99]]},{"id":2,"d":[0,0,-1],"dn":85,"conector":43.9,"face":91.05,"ext":[[37.17,40.87],[41.17,40.99],[41.42,41.18],[43.92,45],[77.92,45.01],[82.42,48],[90.92,47.99],[91.05,47.99]]}],"eOut":23.89,"rcMed":41.36,"rArcoMed":41.02,"rcMedC":41.32,"dn2":0},"joelho90-110":{"fam":"AF_Soldavel_Joelho 45_90","forma":"cotovelo","dn":110,"codigo":"22151037","descricao":"Joelho 90º Soldável 110mm, PVC Marrom, Água Fria - TIGRE","furo":48.9,"rc":55.5,"rC":55,"angulo":90,"pernas":[{"id":1,"d":[-1,0,0],"dn":110,"conector":58.2,"face":117.7,"ext":[[49.95,54.87],[55.45,55],[58.2,58],[76.2,57.82],[102.45,57.99],[108.7,61.1],[117.7,61.1]]},{"id":2,"d":[0,0,-1],"dn":110,"conector":58.2,"face":117.7,"ext":[[49.95,54.86],[55.45,55],[58.2,58],[76.2,57.82],[102.45,57.99],[107.45,60.31],[108.7,61.1],[112.45,60.89],[117.7,61.1]]}],"eOut":30.99,"rcMed":64.13,"rArcoMed":57.55,"rcMedC":57.98,"dn2":0},"curva90-20":{"fam":"AF_Soldavel_Curva 45_90","forma":"cotovelo","dn":20,"codigo":"22120204","descricao":"Curva 90º Soldável 20mm, PVC Marrom, Água Fria - TIGRE","furo":8.5,"rc":36.1,"rC":11.55,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":20,"conector":37,"face":56,"ext":[[32.49,11.34],[35.99,11.54],[36.99,12.39],[50.49,12.4],[50.74,12.44],[52.49,14.29],[55.99,14.3]]},{"id":1,"d":[-1,0,0],"dn":20,"conector":37,"face":56,"ext":[[32.49,11.25],[35.99,11.54],[36.99,12.39],[50.49,12.4],[50.74,12.44],[52.49,14.29],[55.99,14.3]]}],"eOut":-3.41,"rcMed":38.09,"rArcoMed":12.37,"rcMedC":36.11,"dn2":0},"curva90-25":{"fam":"AF_Soldavel_Curva 45_90","forma":"cotovelo","dn":25,"codigo":"22120255","descricao":"Curva 90º Soldável 25mm, PVC Marrom, Água Fria - TIGRE","furo":10.8,"rc":45.89,"rC":14.04,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":25,"conector":46.99,"face":67.39,"ext":[[41.3,13.83],[45.8,14.03],[47.05,15.1],[61.8,15.1],[62.05,15.16],[63.3,16.41],[63.55,16.49],[67.3,16.5],[67.39,16.5]]},{"id":1,"d":[-1,0,0],"dn":25,"conector":46.99,"face":67.39,"ext":[[41.3,13.73],[45.8,14.03],[47.05,15.1],[61.8,15.1],[62.05,15.16],[63.3,16.41],[63.55,16.49],[67.3,16.5],[67.39,16.5]]}],"eOut":-4.96,"rcMed":45.89,"rArcoMed":14.04,"rcMedC":45.88,"dn2":0},"curva90-32":{"fam":"AF_Soldavel_Curva 45_90","forma":"cotovelo","dn":32,"codigo":"22120328","descricao":"Curva 90º Soldável 32mm, PVC Marrom, Água Fria - TIGRE","furo":13.9,"rc":61,"rC":18,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":32,"conector":62.3,"face":86.9,"ext":[[54.9,17.72],[60.9,17.99],[62.4,19],[78.4,19],[80.9,21.5],[86.9,21.5]]},{"id":1,"d":[-1,0,0],"dn":32,"conector":62.3,"face":86.9,"ext":[[54.9,17.61],[60.9,17.99],[62.4,19],[78.4,19],[80.9,21.5],[86.9,21.5]]}],"eOut":-7.27,"rcMed":61.02,"rArcoMed":18.01,"rcMedC":61,"dn2":0},"curva90-40":{"fam":"AF_Soldavel_Curva 45_90","forma":"cotovelo","dn":40,"codigo":"22120409","descricao":"Curva 90º Soldável 40mm, PVC Marrom, Água Fria - TIGRE","furo":17.6,"rc":74.4,"rC":21.65,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":40,"conector":76,"face":107,"ext":[[66.96,21.19],[74.21,21.64],[74.46,21.7],[75.96,23.16],[76.21,23.2],[97.21,23.21],[99.96,25.96],[106.96,25.99],[107,25.99]]},{"id":1,"d":[-1,0,0],"dn":40,"conector":76,"face":107,"ext":[[66.96,21.35],[74.21,21.64],[74.46,21.7],[75.96,23.16],[76.21,23.2],[97.21,23.21],[99.96,25.96],[106.96,26],[107,26]]}],"eOut":-9.81,"rcMed":79.31,"rArcoMed":23.04,"rcMedC":75.95,"dn2":0},"curva90-50":{"fam":"AF_Soldavel_Curva 45_90","forma":"cotovelo","dn":50,"codigo":"22120506","descricao":"Curva 90º Soldável 50mm, PVC Marrom, Água Fria - TIGRE","furo":22,"rc":94.74,"rC":27.15,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":50,"conector":96.44,"face":132.84,"ext":[[85.27,26.57],[94.77,27.17],[96.52,28.65],[122.27,28.65],[125.27,30.7],[132.77,30.74],[132.84,30.74]]},{"id":1,"d":[-1,0,0],"dn":50,"conector":96.44,"face":132.84,"ext":[[85.27,26.77],[94.77,27.17],[96.52,28.65],[122.27,28.65],[125.27,30.7],[132.77,30.75],[132.84,30.75]]}],"eOut":-12.77,"rcMed":99.96,"rArcoMed":28.64,"rcMedC":96.38,"dn2":0},"curva90-60":{"fam":"AF_Soldavel_Curva 45_90","forma":"cotovelo","dn":60,"codigo":"22120603","descricao":"Curva 90º Soldável 60mm, PVC Marrom, Água Fria - TIGRE","furo":26.7,"rc":112.8,"rC":32.15,"angulo":90,"pernas":[{"id":1,"d":[-1,0,0],"dn":60,"conector":115,"face":156,"ext":[[101.52,31.5],[112.77,32.15],[115.02,34.3],[144.27,34.3],[148.02,38],[155.77,38],[156,38]]},{"id":2,"d":[0,0,-1],"dn":60,"conector":115,"face":156,"ext":[[101.52,31.47],[112.77,32.15],[115.02,34.3],[144.27,34.3],[148.02,38],[155.77,38],[156,38]]}],"eOut":-14.57,"rcMed":112.79,"rArcoMed":32.15,"rcMedC":112.78,"dn2":0},"curva90-75":{"fam":"AF_Soldavel_Curva 45_90","forma":"cotovelo","dn":75,"codigo":"22120751","descricao":"Curva 90º Soldável 75mm, PVC Marrom, Água Fria - TIGRE","furo":33.3,"rc":112.76,"rC":35,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":75,"conector":115.26,"face":159.56,"ext":[[101.48,34.51],[112.73,35],[115.23,39.95],[115.48,40],[147.23,40],[151.23,42.98],[159.48,42.99],[159.56,42.99]]},{"id":1,"d":[-1,0,0],"dn":75,"conector":115.26,"face":159.56,"ext":[[101.48,34.35],[112.73,35],[115.23,39.95],[115.48,40],[147.23,40],[151.23,42.98],[159.48,42.99],[159.56,42.99]]}],"eOut":-11.71,"rcMed":112.79,"rArcoMed":35.01,"rcMedC":112.77,"dn2":0},"curva90-85":{"fam":"AF_Soldavel_Curva 45_90","forma":"cotovelo","dn":85,"codigo":"22120859","descricao":"Curva 90º Soldável 85mm, PVC Marrom, Água Fria - TIGRE","furo":37.8,"rc":123.55,"rC":41,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":85,"conector":126.15,"face":175.2,"ext":[[111.2,40.34],[123.45,41],[123.7,41.22],[126.2,45],[161.95,45],[166.45,47.96],[175.2,48]]},{"id":1,"d":[-1,0,0],"dn":85,"conector":126.15,"face":175.2,"ext":[[111.2,40.5],[123.45,41],[123.7,41.22],[126.2,45],[161.95,45],[166.45,47.96],[175.2,48]]}],"eOut":-10.18,"rcMed":123.6,"rArcoMed":41.02,"rcMedC":123.57,"dn2":0},"curva90-110":{"fam":"AF_Soldavel_Curva 45_90","forma":"cotovelo","dn":110,"codigo":"22121030","descricao":"Curva 90º Soldável 110mm, PVC Marrom, Água Fria - TIGRE","furo":48.9,"rc":230.24,"rC":55,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":110,"conector":232.94,"face":295.24,"ext":[[207.22,53.84],[230.22,55],[232.97,58],[253.22,57.78],[279.97,58],[284.72,60.17],[286.22,61.08],[291.47,60.89],[295.22,61.1],[295.24,61.1]]},{"id":1,"d":[-1,0,0],"dn":110,"conector":232.94,"face":295.24,"ext":[[207.22,54.19],[230.22,55],[232.97,58],[279.97,58],[286.22,61.08],[295.22,61.1],[295.24,61.1]]}],"eOut":-41.82,"rcMed":240.35,"rArcoMed":57.74,"rcMedC":233.74,"dn2":0},"joelho90_reducao-25x20":{"fam":"AF_Soldavel_Joelho de Reducao 90","forma":"cotovelo","dn":25,"codigo":"22166662","descricao":"Joelho de Redução 90º Soldável 25x20mm, PVC Marrom, Água Fria - TIGRE","furo":10.8,"rc":14.3,"rC":14.04,"angulo":90,"pernas":[{"id":1,"d":[-1,0,0],"dn":25,"conector":15.3,"face":29.4,"ext":[[12.87,13.71],[14.37,14.11],[15.37,15.1],[24.37,15.1],[25.37,16.94],[29.37,17],[29.4,17]]},{"id":2,"d":[0,0,-1],"dn":20,"conector":15.3,"face":29.5,"ext":[[12.87,11.58],[14.37,11.59],[15.37,12.4],[24.87,12.4],[25.37,12.62],[25.87,13.86],[26.12,14.24],[29.37,14.24],[29.5,14.24]]}],"eOut":6.34,"rcMed":19.54,"rArcoMed":14.44,"rcMedC":18.58,"dn2":20},"joelho90_reducao-32x20":{"fam":"AF_Soldavel_Joelho de Reducao 90","forma":"cotovelo","dn":32,"codigo":null,"descricao":"Produto Inexistente","furo":null,"rc":18.2,"rC":17.6,"angulo":90,"pernas":[{"id":1,"d":[-1,0,0],"dn":32,"conector":20.2,"face":35.8,"ext":[[16.38,17.55],[35.63,17.6],[35.8,17.6]]},{"id":2,"d":[0,0,-1],"dn":20,"conector":20.2,"face":36,"ext":[[16.38,17.54],[35.88,17.6],[36,17.6]]}],"eOut":9.5,"rcMed":21.89,"rArcoMed":18.57,"rcMedC":19.55,"dn2":20},"joelho_rosca-20":{"fam":"AF_Soldavel_Joelho 90 com Rosca","forma":"cotovelo","dn":20,"codigo":"35407782","descricao":"Joelho 90º Soldável com Rosca 20 x 1/2'', PVC Marrom, Água Fria - TIGRE","furo":8.5,"rc":13.5,"rC":11.55,"angulo":90,"pernas":[{"id":1,"d":[-1,0,0],"dn":20,"conector":14.4,"face":28.8,"ext":[[12.15,11.41],[13.4,11.53],[13.65,12.11],[14.4,15],[28.65,15],[28.8,15]]},{"id":2,"d":[0,0,-1],"dn":20,"conector":14.4,"face":26.8,"ext":[[12.15,11.41],[13.4,11.53],[13.65,11.94],[14.4,14],[22.4,14],[23.4,15],[26.65,15],[26.8,15]]}],"eOut":5.1,"rcMed":23.42,"rArcoMed":14.8,"rcMedC":15.58,"dn2":0},"joelho_rosca-25":{"fam":"AF_Soldavel_Joelho 90 com Rosca","forma":"cotovelo","dn":25,"codigo":"35427821","descricao":"Joelho 90º Soldável com Rosca 25 x 1/2'', PVC Marrom, Água Fria - TIGRE","furo":10.8,"rc":14.3,"rC":11.55,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":20,"conector":16.3,"face":29.8,"ext":[[12.87,13.76],[16.37,14.5],[29.62,14.5],[29.8,14.5]]},{"id":1,"d":[-1,0,0],"dn":25,"conector":16.3,"face":31.3,"ext":[[12.87,11.58],[14.37,11.66],[16.37,15],[23.62,15],[25.87,16.49],[31.12,16.5],[31.3,16.5]]}],"eOut":5.54,"rcMed":22.33,"rArcoMed":14.79,"rcMedC":14.5,"dn2":0},"joelho_rosca-32":{"fam":"AF_Soldavel_Joelho 90 com Rosca","forma":"cotovelo","dn":32,"codigo":null,"descricao":"Produto Inexistente","furo":null,"rc":18.2,"rC":14.4,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":20,"conector":20.7,"face":38.7,"ext":[[16.38,14.36],[18.13,14.4],[20.63,17.51],[20.88,17.6],[38.63,17.6],[38.7,17.6]]},{"id":1,"d":[-1,0,0],"dn":32,"conector":20.7,"face":38.2,"ext":[[16.38,14.35],[18.13,14.4],[20.63,17.51],[20.88,17.59],[38.13,17.6],[38.2,17.6]]}],"eOut":6.35,"rcMed":21.55,"rArcoMed":15.28,"rcMedC":19.43,"dn2":0},"joelho_bucha-20":{"fam":"AF_Soldavel_Joelho 90 com Bucha de Latao","forma":"cotovelo","dn":20,"codigo":"35217789","descricao":"Joelho 90º Soldável com Bucha de Latão 20 x 1/2'', PVC Marrom, Água Fria - TIGRE","furo":8.5,"rc":13.5,"rC":11.55,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":20,"conector":14.4,"face":26.8,"ext":[[12.15,11.41],[13.4,11.53],[13.65,11.94],[14.4,14],[22.4,14],[23.4,15],[26.65,15],[26.8,15]]},{"id":1,"d":[-1,0,0],"dn":20,"conector":14.4,"face":26.8,"ext":[[12.15,11.41],[13.4,11.53],[13.65,12.12],[14.4,15],[26.65,15],[26.8,15]]}],"eOut":5.1,"rcMed":24.12,"rArcoMed":15.09,"rcMedC":15.58,"dn2":0},"joelho_bucha-25":{"fam":"AF_Soldavel_Joelho 90 com Bucha de Latao","forma":"cotovelo","dn":25,"codigo":"35227822","descricao":"Joelho 90º Soldável com Bucha de Latão 25 x 1/2'', PVC Marrom, Água Fria - TIGRE","furo":10.8,"rc":14.3,"rC":12,"angulo":90,"pernas":[{"id":1,"d":[-1,0,0],"dn":25,"conector":16.3,"face":29.8,"ext":[[12.87,12.05],[14.37,12.09],[16.37,14.5],[29.62,14.5],[29.8,14.5]]},{"id":2,"d":[0,0,-1],"dn":20,"conector":16.3,"face":29.3,"ext":[[12.87,13.82],[14.37,14.07],[16.37,15],[23.62,15],[25.87,16.49],[29.12,16.5],[29.3,16.5]]}],"eOut":6.57,"rcMed":18.74,"rArcoMed":14.33,"rcMedC":13.11,"dn2":0},"joelho_bucha-32":{"fam":"AF_Soldavel_Joelho 90 com Bucha de Latao","forma":"cotovelo","dn":32,"codigo":null,"descricao":"Produto Inexistente","furo":null,"rc":18.2,"rC":14.4,"angulo":90,"pernas":[{"id":2,"d":[0,0,-1],"dn":20,"conector":20.7,"face":38.7,"ext":[[16.38,14.36],[18.13,14.4],[20.63,17.51],[20.88,17.6],[38.63,17.6],[38.7,17.6]]},{"id":1,"d":[-1,0,0],"dn":32,"conector":20.7,"face":36.2,"ext":[[16.38,14.35],[18.13,14.4],[20.63,17.51],[20.88,17.6],[36.13,17.6],[36.2,17.6]]}],"eOut":6.35,"rcMed":21.55,"rArcoMed":15.28,"rcMedC":19.43,"dn2":0},"te-25":{"fam":"AF_Soldavel_Te_Reducao","forma":"derivacao","dn":25,"codigo":"22200259","descricao":"Tê Soldável 25mm, PVC Marrom, Água Fria - TIGRE","furo":10.8,"pernas":[{"id":3,"d":[0,0,1],"dn":25,"linha":false,"conector":14.5,"face":32,"ext":[[10.75,15.02],[12.25,14.84],[13.75,15.1],[26.5,15.1],[28,16.5],[32,16.5]]},{"id":2,"d":[1,0,0],"dn":25,"linha":true,"conector":15.9,"face":32,"ext":[[2.25,14.01],[9.25,14.04],[10.5,15.1],[26.5,15.1],[28,16.5],[32,16.5]]},{"id":1,"d":[-1,0,0],"dn":25,"linha":true,"conector":15.9,"face":32,"ext":[[2.25,14.01],[9.25,14.04],[10.5,15.1],[26.5,15.1],[28,16.5],[32,16.5]]}],"dn2":0},"te_reducao-32x25":{"fam":"AF_Soldavel_Te_Reducao","forma":"derivacao","dn":32,"codigo":"22216767","descricao":"Tê de Redução Soldável 32x25mm, PVC Marrom, Água Fria - TIGRE","furo":13.9,"pernas":[{"id":2,"d":[1,0,0],"dn":32,"linha":true,"conector":22.7,"face":38.8,"ext":[[1.5,17.92],[6.5,17.69],[9.25,17.77],[9.5,17.96],[17,18],[18.25,19],[30.25,19],[32.75,21.45],[38.75,21.5],[38.8,21.5]]},{"id":1,"d":[-1,0,0],"dn":32,"linha":true,"conector":22.7,"face":38.8,"ext":[[1.5,17.92],[6.5,17.69],[9.25,17.77],[9.5,17.96],[17,18],[18.25,19],[30.25,19],[32.75,21.45],[38.75,21.5],[38.8,21.5]]},{"id":3,"d":[0,0,1],"dn":25,"linha":false,"conector":22.3,"face":39.8,"ext":[[14.25,12.84],[14.5,13.11],[17.5,14.16],[18.25,15.03],[18.5,15.1],[34.25,15.1],[34.5,15.2],[35.75,16.45],[39.75,16.5],[39.8,16.5]]}],"dn2":25},"te_reducao-40x25":{"fam":"AF_Soldavel_Te_Reducao","forma":"derivacao","dn":40,"codigo":"22216821","descricao":"Tê de Redução Soldável 40x25mm, PVC Marrom, Água Fria - TIGRE","furo":17.6,"pernas":[{"id":3,"d":[0,0,1],"dn":25,"linha":false,"conector":25.1,"face":42,"ext":[[16.25,16.96],[17,15.24],[18.25,13.77],[19.5,14.04],[21.25,15.09],[36.5,15.1],[38,16.5],[42,16.5]]},{"id":1,"d":[-1,0,0],"dn":40,"linha":true,"conector":21.9,"face":43.1,"ext":[[3,21.46],[3.5,21.59],[19.5,21.64],[20.5,23.06],[20.75,23.2],[33.25,23.2],[36,25.9],[36.25,25.99],[43,25.99],[43.1,25.99]]},{"id":2,"d":[1,0,0],"dn":40,"linha":true,"conector":21.9,"face":43.1,"ext":[[3,21.46],[3.5,21.59],[19.5,21.64],[20.5,23.06],[20.75,23.2],[33.25,23.2],[36,25.9],[36.25,25.99],[43,25.99],[43.1,25.99]]}],"dn2":25},"te_reducao-50x25":{"fam":"AF_Soldavel_Te_Reducao","forma":"derivacao","dn":50,"codigo":"22216902","descricao":"Tê de Redução Soldável 50x25mm, PVC Marrom, Água Fria - TIGRE","furo":22,"pernas":[{"id":1,"d":[-1,0,0],"dn":50,"linha":true,"conector":32.6,"face":58.5,"ext":[[1,26.25],[6.25,26.36],[6.5,26.85],[11.75,26.62],[28,27.15],[29,28.51],[29.25,28.65],[48,28.65],[51,30.75],[58.5,30.75]]},{"id":2,"d":[1,0,0],"dn":50,"linha":true,"conector":32.6,"face":58.5,"ext":[[1,26.25],[6.25,26.36],[6.5,26.85],[12,26.62],[28,27.15],[29,28.51],[29.25,28.65],[48,28.65],[51,30.75],[58.5,30.75]]},{"id":3,"d":[0,0,1],"dn":25,"linha":false,"conector":33.7,"face":51.2,"ext":[[20.25,17.8],[21.5,16.24],[21.75,19.09],[22.25,16.77],[22.5,15.79],[22.75,18.09],[23,17.67],[23.5,15.86],[23.75,16.93],[24,14.8],[24.25,13.84],[24.5,13.85],[24.75,14.55],[25,13.87],[28,14.04],[29.75,15.2],[45.75,15.2],[47.25,16.19],[51,16.2],[51.2,16.2]]}],"dn2":25},"te_reducao-60x25":{"fam":"AF_Soldavel_Te_Reducao","forma":"derivacao","dn":60,"codigo":"22217011","descricao":"Tê de Redução Soldável 60x25mm, PVC Marrom, Água Fria - TIGRE","furo":26.7,"pernas":[{"id":1,"d":[-1,0,0],"dn":60,"linha":true,"conector":40.3,"face":69.6,"ext":[[4,31.96],[10,31.68],[10.25,32.01],[35,32.15],[36,34.1],[36.25,34.3],[57.75,34.3],[58,34.4],[61.5,37.9],[61.75,37.99],[69.5,38],[69.6,38]]},{"id":2,"d":[1,0,0],"dn":60,"linha":true,"conector":40.3,"face":69.6,"ext":[[4,31.96],[13.5,31.59],[13.75,32.03],[23.5,32.04],[23.75,31.84],[35,32.15],[36,34.1],[36.25,34.3],[57.75,34.3],[58,34.4],[61.5,37.9],[61.75,37.99],[69.5,38],[69.6,38]]},{"id":3,"d":[0,0,1],"dn":25,"linha":false,"conector":41.2,"face":54.2,"ext":[[25.75,17.87],[27.5,16.33],[28,15.61],[28.75,15.16],[29,14.36],[29.25,14.2],[35,14.04],[37.25,15.6],[48.75,15.6],[50.25,16.6],[54,16.59],[54.2,16.59]]}],"dn2":25},"te_reducao-75x25":{"fam":"AF_Soldavel_Te_Reducao","forma":"derivacao","dn":75,"codigo":null,"descricao":"Produto Inexistente","furo":null,"pernas":[{"id":3,"d":[0,0,1],"dn":25,"linha":false,"conector":42.75,"face":86.1,"ext":[[29,40.77],[31.5,43.05],[70.25,43.05],[75,46.2],[86,46.2],[86.1,46.2]]},{"id":1,"d":[-1,0,0],"dn":75,"linha":true,"conector":45.3,"face":84.15,"ext":[[3,40.66],[28.75,40.72],[29,40.77],[31.5,43.05],[35.75,42.81],[36,42.96],[68.25,43.05],[73,46.19],[84,46.2],[84.15,46.2]]},{"id":2,"d":[1,0,0],"dn":75,"linha":true,"conector":45.3,"face":84.15,"ext":[[3,40.57],[28.75,40.72],[29,40.77],[31.5,43.05],[35.75,42.81],[36,42.96],[68.25,43.05],[73,46.19],[84,46.2],[84.15,46.2]]}],"dn2":25},"te_reducao-85x25":{"fam":"AF_Soldavel_Te_Reducao","forma":"derivacao","dn":85,"codigo":null,"descricao":"Produto Inexistente","furo":null,"pernas":[{"id":3,"d":[0,0,1],"dn":25,"linha":false,"conector":48.45,"face":97.58,"ext":[[32.75,46.09],[35.75,48.79],[79.75,48.8],[84.75,52.3],[97.5,52.35],[97.58,52.35]]},{"id":2,"d":[1,0,0],"dn":85,"linha":true,"conector":51.34,"face":95.37,"ext":[[3.25,45.98],[20.25,45.95],[32.75,46.15],[35.75,48.79],[40.5,48.52],[40.75,48.69],[59.75,48.62],[77.5,48.79],[82.75,52.35],[95.25,52.35],[95.37,52.35]]},{"id":1,"d":[-1,0,0],"dn":85,"linha":true,"conector":51.34,"face":95.37,"ext":[[3.25,46.09],[13.25,45.97],[32.75,46.15],[35.75,48.79],[40.5,48.52],[40.75,48.69],[61.25,48.62],[77.5,48.79],[82.75,52.35],[95.25,52.35],[95.37,52.35]]}],"dn2":25},"te_reducao-110x25":{"fam":"AF_Soldavel_Te_Reducao","forma":"derivacao","dn":110,"codigo":null,"descricao":"Produto Inexistente","furo":null,"pernas":[{"id":2,"d":[1,0,0],"dn":110,"linha":true,"conector":66.44,"face":123.42,"ext":[[4.25,59.51],[26,59.47],[42.25,59.72],[42.5,59.77],[46.25,63.14],[57,62.9],[58,63.03],[100.25,63.14],[107,67.76],[114,67.55],[123.25,67.75],[123.42,67.75]]},{"id":1,"d":[-1,0,0],"dn":110,"linha":true,"conector":66.44,"face":123.42,"ext":[[4.25,59.64],[17,59.49],[17.25,59.62],[42.25,59.73],[42.5,59.77],[46.25,63.14],[57,62.9],[58,63.03],[100.25,63.14],[107,67.76],[114,67.55],[123.25,67.75],[123.42,67.75]]},{"id":3,"d":[0,0,1],"dn":25,"linha":false,"conector":62.7,"face":126.28,"ext":[[42.5,59.76],[46.25,63.14],[56.5,62.97],[56.75,62.7],[58.5,63.14],[103,63.14],[103.5,63.36],[109.75,67.74],[119.25,67.55],[126.25,67.76],[126.28,67.76]]}],"dn2":25},"te_bucha-20":{"fam":"AF_Soldavel_Te com Bucha de Latao","forma":"derivacao","dn":20,"codigo":null,"descricao":"Produto Inexistente","furo":null,"pernas":[{"id":3,"d":[0,0,1],"dn":25,"linha":false,"conector":13.27,"face":26.92,"ext":[[12.75,15.38],[26.75,15.43],[26.92,15.43]]},{"id":2,"d":[1,0,0],"dn":20,"linha":true,"conector":13.49,"face":27.15,"ext":[[1,11.5],[3.5,12.4],[4.75,12.26],[5,12.39],[8.5,12.4],[9.5,13.11],[23,13.1],[24.25,13.84],[27,13.84],[27.15,13.84]]},{"id":1,"d":[-1,0,0],"dn":20,"linha":true,"conector":13.49,"face":27.15,"ext":[[1,12.4],[8.5,12.4],[9.5,13.11],[23,13.11],[24.25,13.84],[27,13.84],[27.15,13.84]]}],"dn2":0},"te_bucha-25":{"fam":"AF_Soldavel_Te com Bucha de Latao","forma":"derivacao","dn":25,"codigo":"35288376","descricao":"Tê Soldável com Bucha de Latão na Bolsa Central 25 x 3/4'', PVC Marrom, Água Fria - TIGRE","furo":10.8,"pernas":[{"id":3,"d":[0,0,1],"dn":25,"linha":false,"conector":15.9,"face":32,"ext":[[15.5,18.93],[32,19]]},{"id":2,"d":[1,0,0],"dn":25,"linha":true,"conector":16.4,"face":32.5,"ext":[[1,14],[9.5,14.04],[9.75,14.09],[10.75,15.05],[11,15.1],[26.75,15.1],[28.5,16.5],[32.5,16.5]]},{"id":1,"d":[-1,0,0],"dn":25,"linha":true,"conector":16.4,"face":32.5,"ext":[[1,14],[9.5,14.04],[9.75,14.09],[10.75,15.05],[11,15.1],[26.75,15.1],[28.5,16.5],[32.5,16.5]]}],"dn2":0},"te_bucha-32":{"fam":"AF_Soldavel_Te com Bucha de Latao","forma":"derivacao","dn":32,"codigo":"35308385","descricao":"Tê Soldável com Bucha de Latão na Bolsa Central 32 x 3/4'', PVC Marrom, Água Fria - TIGRE","furo":13.9,"pernas":[{"id":1,"d":[-1,0,0],"dn":32,"linha":true,"conector":18,"face":36,"ext":[[1.75,17.31],[5.75,17.32],[6,18],[7.25,18.03],[8.5,19],[26.5,19],[29,21.5],[36,21.5]]},{"id":2,"d":[1,0,0],"dn":32,"linha":true,"conector":18,"face":36,"ext":[[1.75,17.31],[5,17.33],[5.25,17.77],[6,18],[7.25,18.03],[8.5,19],[26.5,19],[29,21.5],[36,21.5]]},{"id":3,"d":[0,0,1],"dn":25,"linha":false,"conector":19.5,"face":37.5,"ext":[[14.5,17.93],[15.5,19],[37.5,19]]}],"dn2":0},"te_rosca-20":{"fam":"AF_Soldavel_Te Rosca na Bolsa Central","forma":"derivacao","dn":20,"codigo":"35488359","descricao":"Tê Soldável com Rosca na Bolsa Central 20 x 1/2'', PVC Marrom, Água Fria - TIGRE","furo":8.5,"pernas":[{"id":1,"d":[-1,0,0],"dn":20,"linha":true,"conector":13.4,"face":26.5,"ext":[[1,13],[7.5,13],[8.75,13.5],[21.5,13.5],[23,14.3],[26.5,14.3]]},{"id":2,"d":[1,0,0],"dn":20,"linha":true,"conector":13.4,"face":26.5,"ext":[[1,13],[7.5,13],[8.75,13.5],[21.5,13.5],[23,14.3],[26.5,14.3]]},{"id":3,"d":[0,0,1],"dn":20,"linha":false,"conector":16.4,"face":29.5,"ext":[[10.5,14.39],[11.5,15],[29.5,15]]}],"dn2":0},"te_rosca-25":{"fam":"AF_Soldavel_Te Rosca na Bolsa Central","forma":"derivacao","dn":25,"codigo":"35508368","descricao":"Tê Soldável com Rosca na Bolsa Central 25 x 1/2'', PVC Marrom, Água Fria - TIGRE","furo":10.8,"pernas":[{"id":3,"d":[0,0,1],"dn":20,"linha":false,"conector":18,"face":34,"ext":[[11.5,14.28],[13.75,15.8],[34,15.8]]},{"id":2,"d":[1,0,0],"dn":25,"linha":true,"conector":14.5,"face":30.5,"ext":[[1,13.98],[8,14.04],[9.25,15.1],[25,15.1],[26.5,16.5],[30.5,16.5]]},{"id":1,"d":[-1,0,0],"dn":25,"linha":true,"conector":14.5,"face":30.5,"ext":[[1,13.97],[8,14.04],[9.25,15.1],[25,15.1],[26.5,16.5],[30.5,16.5]]}],"dn2":0},"te_rosca-32":{"fam":"AF_Soldavel_Te Rosca na Bolsa Central","forma":"derivacao","dn":32,"codigo":null,"descricao":"Produto Inexistente","furo":null,"pernas":[{"id":2,"d":[1,0,0],"dn":32,"linha":true,"conector":18.04,"face":36.41,"ext":[[1,17.57],[7.75,17.57],[9.25,18.72],[13.5,18.58],[27.25,18.72],[27.5,18.79],[29.75,21.11],[36.25,21.17],[36.41,21.17]]},{"id":1,"d":[-1,0,0],"dn":32,"linha":true,"conector":18.04,"face":36.41,"ext":[[1,17.57],[7.75,17.57],[9,18.66],[9.25,18.72],[27.25,18.72],[27.5,18.79],[29.75,21.11],[36.25,21.17],[36.41,21.17]]},{"id":3,"d":[0,0,1],"dn":20,"linha":false,"conector":19.2,"face":37.57,"ext":[[13.75,17.77],[14.5,18.51],[16,19.29],[37.5,19.31],[37.57,19.31]]}],"dn2":0},"cruzeta-25":{"fam":"AF_Soldavel_Cruzeta","forma":"derivacao","dn":25,"codigo":"22090259","descricao":"Cruzeta Soldável 25mm, PVC Marrom, Água Fria - TIGRE","furo":10.8,"pernas":[{"id":2,"d":[1,0,0],"dn":25,"linha":true,"conector":16.1,"face":32,"ext":[[10.75,15.02],[12.25,14.84],[13.75,15.1],[26.5,15.1],[28,16.5],[32,16.5]]},{"id":3,"d":[0,0,1],"dn":25,"linha":true,"conector":16.1,"face":32,"ext":[[10.75,15.02],[12.25,14.83],[13.75,15.1],[26.5,15.1],[28,16.5],[32,16.5]]},{"id":1,"d":[-1,0,0],"dn":25,"linha":true,"conector":16.1,"face":32,"ext":[[10.75,15.02],[12.25,14.83],[13.75,15.1],[26.5,15.1],[28,16.5],[32,16.5]]},{"id":4,"d":[0,0,-1],"dn":25,"linha":true,"conector":16.1,"face":32,"ext":[[10.75,15.02],[12.25,14.84],[13.75,15.1],[26.5,15.1],[28,16.5],[32,16.5]]}],"dn2":0},"cruzeta-50":{"fam":"AF_Soldavel_Cruzeta","forma":"derivacao","dn":50,"codigo":null,"descricao":"Produto Inexistente","furo":null,"pernas":[{"id":3,"d":[0,0,1],"dn":25,"linha":true,"conector":32.2,"face":64,"ext":[[21.5,30.05],[24.25,29.66],[26,29.82],[26.25,30.15],[27.5,30.19],[53,30.2],[53.25,30.25],[56,33],[64,33]]},{"id":4,"d":[0,0,-1],"dn":25,"linha":true,"conector":32.2,"face":64,"ext":[[21.5,30.05],[24.25,29.66],[26,29.82],[26.25,30.18],[53,30.2],[53.25,30.25],[56,33],[64,33]]},{"id":2,"d":[1,0,0],"dn":50,"linha":true,"conector":32.2,"face":64,"ext":[[21.5,30.05],[24.25,29.66],[26,29.82],[26.25,30.15],[27.5,30.19],[53,30.2],[53.25,30.25],[56,33],[64,33]]},{"id":1,"d":[-1,0,0],"dn":50,"linha":true,"conector":32.2,"face":64,"ext":[[21.5,30.05],[24.25,29.66],[26,29.82],[26.25,30.15],[27.5,30.19],[53,30.2],[53.25,30.25],[56,33],[64,33]]}],"dn2":0},"luva-20":{"fam":"AF_Soldavel_Luva","forma":"reta","dn":20,"codigo":"22170201","descricao":"Luva Soldável 20mm, PVC Marrom, Água Fria - TIGRE","furo":8.5,"L":35,"ext":[[-17.45,14.25],[-13.95,14.2],[-12.2,12.49],[-11.95,12.4],[-4.45,12.37],[12.05,12.4],[14.05,14.24],[17.3,14.24]],"bocas":[{"id":2,"sinal":1,"dn":20,"conector":5.4},{"id":1,"sinal":-1,"dn":20,"conector":-5.4}],"min":-17.5,"max":17.5,"dn2":0},"luva-25":{"fam":"AF_Soldavel_Luva","forma":"reta","dn":25,"codigo":"22170252","descricao":"Luva Soldável 25mm, PVC Marrom, Água Fria - TIGRE","furo":10.8,"L":40,"ext":[[-19.95,17],[-15.95,16.95],[-14.2,15.2],[-13.95,15.1],[14.05,15.1],[16.05,16.99],[19.8,17]],"bocas":[{"id":2,"sinal":1,"dn":25,"conector":5.9},{"id":1,"sinal":-1,"dn":25,"conector":-5.9}],"min":-20,"max":20,"dn2":0},"luva-32":{"fam":"AF_Soldavel_Luva","forma":"reta","dn":32,"codigo":"22170325","descricao":"Luva Soldável 32mm, PVC Marrom, Água Fria - TIGRE","furo":13.9,"L":48,"ext":[[-23.95,21.5],[-18.95,21.45],[-16.45,18.95],[-16.2,18.9],[16.3,18.9],[19.05,21.5],[23.8,21.49]],"bocas":[{"id":2,"sinal":1,"dn":32,"conector":7.6},{"id":1,"sinal":-1,"dn":32,"conector":-7.6}],"min":-24,"max":24,"dn2":0},"luva-40":{"fam":"AF_Soldavel_Luva","forma":"reta","dn":40,"codigo":"22170406","descricao":"Luva Soldável 40mm, PVC Marrom, Água Fria - TIGRE","furo":17.6,"L":55,"ext":[[-27.45,25.99],[-21.45,25.95],[-18.7,23.25],[18.55,23.25],[18.8,23.35],[21.55,26],[27.3,25.99]],"bocas":[{"id":1,"sinal":-1,"dn":40,"conector":-8.8},{"id":2,"sinal":1,"dn":40,"conector":8.8}],"min":-27.5,"max":27.5,"dn2":0},"luva-50":{"fam":"AF_Soldavel_Luva","forma":"reta","dn":50,"codigo":"22170511","descricao":"Luva Soldável 50mm, PVC Marrom, Água Fria - TIGRE","furo":22,"L":65,"ext":[[-32.45,31.49],[-25.45,31.45],[-22.7,28.7],[-22.45,28.6],[22.55,28.6],[25.55,31.49],[32.3,31.49]],"bocas":[{"id":1,"sinal":-1,"dn":50,"conector":-9.9},{"id":2,"sinal":1,"dn":50,"conector":9.9}],"min":-32.5,"max":32.5,"dn2":0},"luva-60":{"fam":"AF_Soldavel_Luva","forma":"reta","dn":60,"codigo":"22170600","descricao":"Luva Soldável 60mm, PVC Marrom, Água Fria - TIGRE","furo":26.7,"L":80,"ext":[[-39.95,38],[-31.95,37.95],[-28.2,34.3],[28.3,34.3],[32.05,38],[39.8,38]],"bocas":[{"id":1,"sinal":-1,"dn":60,"conector":-11.7},{"id":2,"sinal":1,"dn":60,"conector":11.7}],"min":-40,"max":40,"dn2":0},"luva-75":{"fam":"AF_Soldavel_Luva","forma":"reta","dn":75,"codigo":"22170759","descricao":"Luva Soldável 75mm, PVC Marrom, Água Fria - TIGRE","furo":33.3,"L":91,"ext":[[-45.45,47.5],[-35.95,47.45],[-31.2,42.8],[31.3,42.8],[36.05,47.5],[45.3,47.49]],"bocas":[{"id":2,"sinal":1,"dn":75,"conector":14.2},{"id":1,"sinal":-1,"dn":75,"conector":-14.2}],"min":-45.5,"max":45.5,"dn2":0},"luva-85":{"fam":"AF_Soldavel_Luva","forma":"reta","dn":85,"codigo":"22170856","descricao":"Luva Soldável 85mm, PVC Marrom, Água Fria - TIGRE","furo":37.8,"L":102,"ext":[[-50.95,52.2],[-39.95,52.18],[-34.95,50.1],[35.05,50.1],[40.05,52.2],[50.8,52.2]],"bocas":[{"id":2,"sinal":1,"dn":85,"conector":15.9},{"id":1,"sinal":-1,"dn":85,"conector":-15.9}],"min":-51,"max":51,"dn2":0},"luva-110":{"fam":"AF_Soldavel_Luva","forma":"reta","dn":110,"codigo":"22171038","descricao":"Luva Soldável 110mm, PVC Marrom, Água Fria - TIGRE","furo":48.9,"L":130,"ext":[[-64.95,67.44],[-51.45,67.43],[-45.45,64.65],[45.55,64.65],[51.55,67.45],[64.8,67.44]],"bocas":[{"id":2,"sinal":1,"dn":110,"conector":19.45},{"id":1,"sinal":-1,"dn":110,"conector":-19.45}],"min":-65,"max":65,"dn2":0},"uniao-20":{"fam":"AF_Soldavel_Uniao","forma":"reta","dn":20,"codigo":"22220209","descricao":"União Soldável 20mm, PVC Marrom, Água Fria - TIGRE","furo":8.5,"L":46,"ext":[[-22.95,13.1],[-9.45,13.1],[-9.2,20.3],[9.05,20.3],[9.3,13.1],[22.8,13.1]],"bocas":[{"id":1,"sinal":-1,"dn":20,"conector":-6},{"id":2,"sinal":1,"dn":20,"conector":6}],"min":-23,"max":23,"dn2":0},"uniao-25":{"fam":"AF_Soldavel_Uniao","forma":"reta","dn":25,"codigo":"22220250","descricao":"União Soldável 25mm, PVC Marrom, Água Fria - TIGRE","furo":10.8,"L":51,"ext":[[-25.45,17.5],[-10.45,17.5],[-10.2,25.2],[10.05,25.2],[10.3,17.5],[25.3,17.5]],"bocas":[{"id":2,"sinal":1,"dn":25,"conector":6.65},{"id":1,"sinal":-1,"dn":25,"conector":-6.65}],"min":-25.5,"max":25.5,"dn2":0},"uniao-32":{"fam":"AF_Soldavel_Uniao","forma":"reta","dn":32,"codigo":"22220322","descricao":"União Soldável 32mm, PVC Marrom, Água Fria - TIGRE","furo":13.9,"L":55,"ext":[[-27.45,20.2],[-11.95,20.2],[-11.7,29.3],[11.55,29.3],[11.8,20.2],[27.3,20.2]],"bocas":[{"id":2,"sinal":1,"dn":32,"conector":7.75},{"id":1,"sinal":-1,"dn":32,"conector":-7.75}],"min":-27.5,"max":27.5,"dn2":0},"uniao-40":{"fam":"AF_Soldavel_Uniao","forma":"reta","dn":40,"codigo":"22220403","descricao":"União Soldável 40mm, PVC Marrom, Água Fria - TIGRE","furo":17.6,"L":58,"ext":[[-28.95,24.5],[-14.2,24.5],[-13.95,34.9],[13.8,34.9],[14.05,24.5],[28.8,24.5]],"bocas":[{"id":2,"sinal":1,"dn":40,"conector":8},{"id":1,"sinal":-1,"dn":40,"conector":-8}],"min":-29,"max":29,"dn2":0},"uniao-50":{"fam":"AF_Soldavel_Uniao","forma":"reta","dn":50,"codigo":"22220500","descricao":"União Soldável 50mm, PVC Marrom, Água Fria - TIGRE","furo":22,"L":68,"ext":[[-33.95,30.7],[-15.2,30.7],[-14.95,44.2],[14.8,44.2],[15.05,30.7],[33.8,30.7]],"bocas":[{"id":2,"sinal":1,"dn":50,"conector":8},{"id":1,"sinal":-1,"dn":50,"conector":-8}],"min":-34,"max":34,"dn2":0},"uniao-60":{"fam":"AF_Soldavel_Uniao","forma":"reta","dn":60,"codigo":"22220608","descricao":"União Soldável 60mm, PVC Marrom, Água Fria - TIGRE","furo":26.7,"L":78,"ext":[[-38.95,36.5],[-16.45,36.5],[-16.2,51.5],[16.05,51.5],[16.3,36.5],[38.8,36.5]],"bocas":[{"id":2,"sinal":1,"dn":60,"conector":8.75},{"id":1,"sinal":-1,"dn":60,"conector":-8.75}],"min":-39,"max":39,"dn2":0},"uniao-75":{"fam":"AF_Soldavel_Uniao","forma":"reta","dn":75,"codigo":"22220756","descricao":"União Soldável 75mm, PVC Marrom, Água Fria - TIGRE","furo":33.3,"L":94,"ext":[[-46.95,46.4],[-21.95,46.4],[-21.7,67.9],[21.55,67.9],[21.8,46.4],[46.8,46.4]],"bocas":[{"id":1,"sinal":-1,"dn":75,"conector":-12.75},{"id":2,"sinal":1,"dn":75,"conector":12.75}],"min":-47,"max":47,"dn2":0},"uniao-85":{"fam":"AF_Soldavel_Uniao","forma":"reta","dn":85,"codigo":"22220853","descricao":"União Soldável 85mm, PVC Marrom, Água Fria - TIGRE","furo":37.8,"L":109,"ext":[[-54.45,53.7],[-22.7,53.7],[-22.45,77.6],[22.3,77.6],[22.55,53.7],[54.3,53.7]],"bocas":[{"id":2,"sinal":1,"dn":85,"conector":12.1},{"id":1,"sinal":-1,"dn":85,"conector":-12.1}],"min":-54.5,"max":54.5,"dn2":0},"uniao-110":{"fam":"AF_Soldavel_Uniao","forma":"reta","dn":110,"codigo":"22221035","descricao":"União Soldável 110mm, PVC Marrom, Água Fria - TIGRE","furo":48.9,"L":150,"ext":[[-74.95,69.6],[-24.2,69.6],[-23.95,92.1],[23.8,92.1],[24.05,69.6],[74.8,69.6]],"bocas":[{"id":1,"sinal":-1,"dn":110,"conector":-12},{"id":2,"sinal":1,"dn":110,"conector":12}],"min":-75,"max":75,"dn2":0},"luva_rosca-20":{"fam":"AF_Soldavel_Luva com Rosca","forma":"reta","dn":20,"codigo":"35447784","descricao":"Luva Soldável e com Rosca 20 x 1/2'', PVC Marrom, Água Fria - TIGRE","furo":8.5,"L":33,"ext":[[-16.45,15],[1.8,15],[2.05,14.95],[4.55,12.45],[4.8,12.4],[11.05,12.4],[13.05,14.29],[16.3,14.29]],"bocas":[{"id":1,"sinal":-1,"dn":20,"conector":-5.5},{"id":2,"sinal":1,"dn":20,"conector":5.5}],"min":-16.5,"max":16.5,"dn2":0},"luva_rosca-25":{"fam":"AF_Soldavel_Luva com Rosca","forma":"reta","dn":25,"codigo":"35467823","descricao":"Luva Soldável e com Rosca 25 x 1/2'', PVC Marrom, Água Fria - TIGRE","furo":10.8,"L":36,"ext":[[-17.95,18.1],[0.8,18.1],[3.8,15.2],[4.05,15.1],[12.05,15.1],[12.3,15.2],[14.05,16.95],[17.8,17]],"bocas":[{"id":1,"sinal":-1,"dn":25,"conector":0.9},{"id":2,"sinal":1,"dn":20,"conector":4.8}],"min":-18,"max":18,"dn2":0},"luva_rosca-32":{"fam":"AF_Soldavel_Luva com Rosca","forma":"reta","dn":32,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":49,"ext":[[-24.45,19.26],[24.3,19.26]],"bocas":[{"id":1,"sinal":-1,"dn":32,"conector":-1.44},{"id":2,"sinal":1,"dn":20,"conector":3.46}],"min":-24.5,"max":24.5,"dn2":0},"luva_rosca-40":{"fam":"AF_Soldavel_Luva com Rosca","forma":"reta","dn":40,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":54.4,"ext":[[-27.15,24.07],[27.1,24.07]],"bocas":[{"id":1,"sinal":-1,"dn":40,"conector":-0.64},{"id":2,"sinal":1,"dn":20,"conector":5.23}],"min":-27.2,"max":27.2,"dn2":0},"luva_rosca-50":{"fam":"AF_Soldavel_Luva com Rosca","forma":"reta","dn":50,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":60,"ext":[[-29.95,30.11],[29.8,30.11]],"bocas":[{"id":2,"sinal":1,"dn":20,"conector":8.03},{"id":1,"sinal":-1,"dn":50,"conector":0.94}],"min":-30,"max":30,"dn2":0},"luva_correr-20":{"fam":"AF_Soldavel_Luva de Correr","forma":"reta","dn":20,"codigo":"22172107","descricao":"Luva de Correr Soldável 20mm, PVC Marrom, Água Fria - TIGRE","furo":8.5,"L":46,"ext":[[-22.95,15.3],[-14.45,15.3],[-12.2,13.2],[-4.7,13.17],[12.3,13.2],[13.3,13.83],[14.3,15.16],[14.55,15.3],[22.8,15.3]],"bocas":[{"id":1,"sinal":-1,"dn":20,"conector":-8},{"id":2,"sinal":1,"dn":20,"conector":8}],"min":-23,"max":23,"dn2":0},"luva_correr-25":{"fam":"AF_Soldavel_Luva de Correr","forma":"reta","dn":25,"codigo":"22172204","descricao":"Luva de Correr Soldável 25mm, PVC Marrom, Água Fria - TIGRE","furo":10.8,"L":51.5,"ext":[[-25.7,18],[-15.95,18],[-13.2,15.4],[13.05,15.4],[14.3,16.06],[15.8,17.93],[16.05,18],[25.55,18]],"bocas":[{"id":1,"sinal":-1,"dn":25,"conector":-10},{"id":2,"sinal":1,"dn":25,"conector":10}],"min":-25.75,"max":25.75,"dn2":0},"luva_correr-32":{"fam":"AF_Soldavel_Luva de Correr","forma":"reta","dn":32,"codigo":"22172239","descricao":"Luva de Correr Soldável 32mm, PVC Marrom, Água Fria - TIGRE","furo":13.9,"L":59,"ext":[[-29.45,23.09],[-19.2,23.1],[-18.95,23.05],[-16.45,20.55],[-16.2,20.5],[16.3,20.5],[17.55,21.11],[19.05,23.1],[29.3,23.1]],"bocas":[{"id":2,"sinal":1,"dn":32,"conector":12.8},{"id":1,"sinal":-1,"dn":32,"conector":-12.8}],"min":-29.5,"max":29.5,"dn2":0},"luva_correr-40":{"fam":"AF_Soldavel_Luva de Correr","forma":"reta","dn":40,"codigo":"22172263","descricao":"Luva de Correr Soldável 40mm, PVC Marrom, Água Fria - TIGRE","furo":17.6,"L":75,"ext":[[-37.45,29.65],[-23.2,29.65],[-19.45,26],[19.3,26],[21.05,26.91],[23.05,29.58],[23.3,29.64],[37.3,29.65]],"bocas":[{"id":1,"sinal":-1,"dn":40,"conector":-16},{"id":2,"sinal":1,"dn":40,"conector":16}],"min":-37.5,"max":37.5,"dn2":0},"luva_correr-50":{"fam":"AF_Soldavel_Luva de Correr","forma":"reta","dn":50,"codigo":"22172301","descricao":"Luva de Correr Soldável 50mm, PVC Marrom, Água Fria - TIGRE","furo":22,"L":83,"ext":[[-41.45,33.25],[-26.45,33.2],[-22.45,29.25],[22.3,29.25],[24.3,30.26],[26.55,33.25],[41.3,33.25]],"bocas":[{"id":2,"sinal":1,"dn":50,"conector":20},{"id":1,"sinal":-1,"dn":50,"conector":-20}],"min":-41.5,"max":41.5,"dn2":0},"luva_correr-60":{"fam":"AF_Soldavel_Luva de Correr","forma":"reta","dn":60,"codigo":"22172352","descricao":"Luva de Correr Soldável 60mm, PVC Marrom, Água Fria - TIGRE","furo":26.7,"L":94.5,"ext":[[-47.2,40.05],[-31.7,40.05],[-27.2,35.65],[27.05,35.65],[29.3,36.71],[31.55,39.9],[31.8,40.04],[47.05,40.05]],"bocas":[{"id":2,"sinal":1,"dn":60,"conector":24},{"id":1,"sinal":-1,"dn":60,"conector":-24}],"min":-47.25,"max":47.25,"dn2":0},"luva_bucha-20":{"fam":"AF_Soldavel_Luva com Bucha de Latao","forma":"reta","dn":20,"codigo":"35247785","descricao":"Luva Soldável e com Bucha de Latão 20 x 1/2'', PVC Marrom, Água Fria - TIGRE","furo":8.5,"L":36,"ext":[[-17.95,15.6],[0.3,15.6],[0.55,15.55],[3.8,12.4],[12.55,12.4],[14.55,14.24],[17.8,14.24]],"bocas":[{"id":1,"sinal":-1,"dn":20,"conector":-4},{"id":2,"sinal":1,"dn":20,"conector":4}],"min":-18,"max":18,"dn2":0},"luva_bucha-25":{"fam":"AF_Soldavel_Luva com Bucha de Latao","forma":"reta","dn":25,"codigo":"35267824","descricao":"Luva Soldável e com Bucha de Latão 25 x 1/2'', PVC Marrom, Água Fria - TIGRE","furo":10.8,"L":40.2,"ext":[[-20.05,18.5],[-1.3,18.5],[2.2,15.1],[14.2,15.1],[14.45,15.2],[16.2,16.95],[19.95,16.95]],"bocas":[{"id":1,"sinal":-1,"dn":25,"conector":-1.2},{"id":2,"sinal":1,"dn":20,"conector":2.7}],"min":-20.1,"max":20.1,"dn2":0},"luva_bucha-32":{"fam":"AF_Soldavel_Luva com Bucha de Latao","forma":"reta","dn":32,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":47.6,"ext":[[-23.75,18.89],[23.75,18.89]],"bocas":[{"id":1,"sinal":-1,"dn":32,"conector":-0.77},{"id":2,"sinal":1,"dn":20,"conector":4.16}],"min":-23.8,"max":23.8,"dn2":0},"cap-20":{"fam":"AF_Soldavel_Cap","forma":"reta","dn":20,"codigo":"22080202","descricao":"Cap Soldável 20mm, PVC Marrom, Água Fria - TIGRE","furo":8.5,"L":16,"ext":[[-7.95,14.25],[-4.45,14.2],[-2.7,12.5],[-2.45,12.4],[5.3,12.4],[5.55,12.24],[7.05,7.42],[7.3,6.44],[7.55,4.55]],"bocas":[{"id":1,"sinal":-1,"dn":20,"conector":5.5}],"min":-8,"max":8,"dn2":0},"cap-25":{"fam":"AF_Soldavel_Cap","forma":"reta","dn":25,"codigo":"22080253","descricao":"Cap Soldável 25mm, PVC Marrom, Água Fria - TIGRE","furo":10.8,"L":18.5,"ext":[[-9.2,17],[-5.2,16.95],[-3.45,15.2],[-3.2,15.1],[6.3,15.1],[6.55,14.82],[8.3,8.61],[8.55,7.35],[8.8,4.95]],"bocas":[{"id":1,"sinal":-1,"dn":25,"conector":6.47}],"min":-9.25,"max":9.25,"dn2":0},"cap-32":{"fam":"AF_Soldavel_Cap","forma":"reta","dn":32,"codigo":"22080326","descricao":"Cap Soldável 32mm, PVC Marrom, Água Fria - TIGRE","furo":13.9,"L":22,"ext":[[-10.95,21.5],[-5.45,21.5],[-5.2,21.36],[-3.45,18.97],[-3.2,18.9],[7.8,18.9],[9.55,12.2],[10.05,10.02],[10.3,8.27],[10.55,5.46]],"bocas":[{"id":1,"sinal":-1,"dn":32,"conector":7.8}],"min":-11,"max":11,"dn2":0},"cap-40":{"fam":"AF_Soldavel_Cap","forma":"reta","dn":40,"codigo":"22080407","descricao":"Cap Soldável 40mm, PVC Marrom, Água Fria - TIGRE","furo":17.6,"L":26,"ext":[[-12.95,26],[-6.2,26],[-5.95,25.78],[-4.2,23.25],[10.05,23.25],[10.3,22.3],[12.05,13.04],[12.3,11],[12.55,8.53],[12.8,3.35]],"bocas":[{"id":1,"sinal":-1,"dn":40,"conector":10.12}],"min":-13,"max":13,"dn2":0},"cap-50":{"fam":"AF_Soldavel_Cap","forma":"reta","dn":50,"codigo":"22080504","descricao":"Cap Soldável 50mm, PVC Marrom, Água Fria - TIGRE","furo":22,"L":31,"ext":[[-15.45,31.5],[-7.45,31.43],[-5.7,28.76],[-5.45,28.6],[10.05,28.6],[10.3,28.12],[12.8,20.5],[14.05,15.09],[14.3,13.82],[14.55,12.31],[14.8,10.14],[15.3,2.9]],"bocas":[{"id":1,"sinal":-1,"dn":50,"conector":10.14}],"min":-15.5,"max":15.5,"dn2":0},"cap-60":{"fam":"AF_Soldavel_Cap","forma":"reta","dn":60,"codigo":"22080601","descricao":"Cap Soldável 60mm, PVC Marrom, Água Fria - TIGRE","furo":26.7,"L":36,"ext":[[-17.95,38.01],[-8.2,38.01],[-6.45,34.59],[-6.2,34.3],[12.8,34.22],[15.05,25.94],[15.55,23.65],[16.55,18.23],[17.05,14.89],[17.3,11.7],[17.8,3.34]],"bocas":[{"id":1,"sinal":-1,"dn":60,"conector":12.78}],"min":-18,"max":18,"dn2":0},"cap-75":{"fam":"AF_Soldavel_Cap","forma":"reta","dn":75,"codigo":"22080750","descricao":"Cap Soldável 75mm, PVC Marrom, Água Fria - TIGRE","furo":33.3,"L":43.5,"ext":[[-21.7,47.5],[-9.7,47.5],[-7.7,42.8],[15.8,42.75],[18.55,31.46],[18.8,30.29],[19.3,27.28],[19.8,24.56],[20.3,21.41],[20.55,19.45],[20.8,16.85],[21.3,12.03],[21.55,5.01]],"bocas":[{"id":1,"sinal":-1,"dn":75,"conector":15.79}],"min":-21.75,"max":21.75,"dn2":0},"cap-85":{"fam":"AF_Soldavel_Cap","forma":"reta","dn":85,"codigo":"22080857","descricao":"Cap Soldável 85mm, PVC Marrom, Água Fria - TIGRE","furo":37.8,"L":48.5,"ext":[[-24.2,52.2],[-11.95,52.2],[-9.95,50.1],[14.3,50.01],[19.05,36.48],[19.55,34.77],[20.3,31.44],[21.8,25.36],[22.55,21.01],[22.8,19.29],[23.05,16.56],[24.05,2.76]],"bocas":[{"id":1,"sinal":-1,"dn":85,"conector":14.27}],"min":-24.25,"max":24.25,"dn2":0},"cap-110":{"fam":"AF_Soldavel_Cap","forma":"reta","dn":110,"codigo":"22081039","descricao":"Cap Soldável 110mm, PVC Marrom, Água Fria - TIGRE","furo":48.9,"L":58.8,"ext":[[-29.35,67.45],[-15.85,67.45],[-15.6,67.23],[-13.85,64.65],[15.9,64.62],[22.15,47.71],[23.15,44.42],[24.4,39.22],[25.9,33.47],[26.4,30.98],[26.65,29.41],[27.4,25.48],[27.65,23.12],[27.9,20.17],[29.15,3.36]],"bocas":[{"id":1,"sinal":-1,"dn":110,"conector":15.89}],"min":-29.4,"max":29.4,"dn2":0},"adaptador-20":{"fam":"AF_Soldavel_Adaptador Curto com Bolsa e Rosca","forma":"reta","dn":20,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":49.66,"ext":[[-24.78,20.59],[-0.03,20.59],[0.22,16],[24.72,16]],"bocas":[{"id":2,"sinal":1,"dn":32,"conector":24.83},{"id":1,"sinal":-1,"dn":20,"conector":0.19}],"min":-24.83,"max":24.83,"dn2":0},"adaptador-25":{"fam":"AF_Soldavel_Adaptador Curto com Bolsa e Rosca","forma":"reta","dn":25,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":49.66,"ext":[[-24.78,20.59],[-0.03,20.59],[0.22,16],[24.72,16]],"bocas":[{"id":1,"sinal":-1,"dn":25,"conector":0.19},{"id":2,"sinal":1,"dn":32,"conector":24.83}],"min":-24.83,"max":24.83,"dn2":0},"adaptador-32":{"fam":"AF_Soldavel_Adaptador Curto com Bolsa e Rosca","forma":"reta","dn":32,"codigo":"22000322","descricao":"Adaptador Soldável Curto com Bolsa e Rosca para Registro 32 x 1'', PVC Marrom, Água Fria - TIGRE","furo":13.9,"L":50.7,"ext":[[-25.3,21],[-20.3,20.93],[-18.8,19.17],[-18.05,18.89],[-8.8,18.61],[-0.8,18.9],[1.45,16.88],[2.95,16],[25.2,15.99]],"bocas":[{"id":2,"sinal":1,"dn":32,"conector":25.35},{"id":1,"sinal":-1,"dn":32,"conector":-0.73}],"min":-25.35,"max":25.35,"dn2":0},"adaptador-40":{"fam":"AF_Soldavel_Adaptador Curto com Bolsa e Rosca","forma":"reta","dn":40,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":56.54,"ext":[[-28.22,25.16],[-0.72,25.16],[-0.47,16],[28.03,16]],"bocas":[{"id":1,"sinal":-1,"dn":40,"conector":-0.59},{"id":2,"sinal":1,"dn":32,"conector":28.27}],"min":-28.27,"max":28.27,"dn2":0},"adaptador-50":{"fam":"AF_Soldavel_Adaptador Curto com Bolsa e Rosca","forma":"reta","dn":50,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":65.15,"ext":[[-32.53,30.86],[-1.78,30.86],[-1.53,16],[32.47,16]],"bocas":[{"id":1,"sinal":-1,"dn":50,"conector":-1.58},{"id":2,"sinal":1,"dn":32,"conector":32.57}],"min":-32.58,"max":32.58,"dn2":0},"adaptador-60":{"fam":"AF_Soldavel_Adaptador Curto com Bolsa e Rosca","forma":"reta","dn":60,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":73.75,"ext":[[-36.83,36.56],[-2.58,36.56],[-2.33,16],[36.67,16]],"bocas":[{"id":1,"sinal":-1,"dn":60,"conector":-2.55},{"id":2,"sinal":1,"dn":32,"conector":36.88}],"min":-36.87,"max":36.88,"dn2":0},"adaptador-75":{"fam":"AF_Soldavel_Adaptador Curto com Bolsa e Rosca","forma":"reta","dn":75,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":86.65,"ext":[[-43.28,45.12],[-4.03,45.12],[-3.78,16],[43.22,16]],"bocas":[{"id":1,"sinal":-1,"dn":75,"conector":-4.02},{"id":2,"sinal":1,"dn":32,"conector":43.33}],"min":-43.32,"max":43.33,"dn2":0},"adaptador-85":{"fam":"AF_Soldavel_Adaptador Curto com Bolsa e Rosca","forma":"reta","dn":85,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":95.25,"ext":[[-47.57,50.82],[-5.08,50.82],[-4.83,16],[47.43,16]],"bocas":[{"id":2,"sinal":1,"dn":32,"conector":47.63},{"id":1,"sinal":-1,"dn":85,"conector":-5.01}],"min":-47.62,"max":47.63,"dn2":0},"adaptador-110":{"fam":"AF_Soldavel_Adaptador Curto com Bolsa e Rosca","forma":"reta","dn":110,"codigo":null,"descricao":"Produto Inexistente","furo":null,"L":116.75,"ext":[[-58.32,65.08],[-7.58,65.09],[-7.33,16],[58.18,16]],"bocas":[{"id":2,"sinal":1,"dn":32,"conector":58.38},{"id":1,"sinal":-1,"dn":110,"conector":-7.45}],"min":-58.37,"max":58.38,"dn2":0},"bucha-32x25":{"fam":"AF_Soldavel_Bucha de Reducao Curta","forma":"reta","dn":32,"codigo":null,"descricao":null,"furo":13.9,"L":22,"ext":[[-10.95,16],[10.8,16]],"bocas":[{"id":1,"sinal":-1,"dn":25,"conector":9.5},{"id":2,"sinal":1,"dn":32,"conector":11}],"min":-11,"max":11,"dn2":25},"bucha_longa-32x20":{"fam":"AF_Soldavel_Bucha de Reducao Longa","forma":"reta","dn":32,"codigo":null,"descricao":null,"furo":13.9,"L":44,"ext":[[-21.95,16.2],[0.05,16.18],[6.05,12.43],[6.3,12.4],[16.55,12.4],[18.55,14.3],[21.8,14.3]],"bocas":[{"id":2,"sinal":1,"dn":20,"conector":6.1},{"id":1,"sinal":-1,"dn":32,"conector":-22}],"min":-22,"max":22,"dn2":20},"luva_reducao-25x20":{"fam":"AF_Soldavel_Luva de Reducao","forma":"reta","dn":25,"codigo":null,"descricao":null,"furo":10.8,"L":40,"ext":[[-19.95,17],[-15.95,16.95],[-14.2,15.2],[-13.95,15.1],[-1.2,15.1],[1.55,12.4],[14.55,12.4],[16.55,14.25],[19.8,14.25]],"bocas":[{"id":1,"sinal":-1,"dn":25,"conector":-4.9},{"id":2,"sinal":1,"dn":20,"conector":7.6}],"min":-20,"max":20,"dn2":20},"curva_transposicao-20":{"fam":"AF_Soldavel_Curva de Transposicao","forma":"transposicao","dn":20,"codigo":"22123017","descricao":"Curva de Transposição Soldável 20mm, PVC Marrom, Água Fria - TIGRE","furo":8.5,"L":136.2,"conector":51.7,"rBolsa":11,"rTubo":10,"crista":18.13,"lado":[0,0,-1],"raio":25,"B":40.7,"dn2":0},"curva_transposicao-25":{"fam":"AF_Soldavel_Curva de Transposicao","forma":"transposicao","dn":25,"codigo":"22123050","descricao":"Curva de Transposição Soldável 25mm, PVC Marrom, Água Fria - TIGRE","furo":10.8,"L":168,"conector":65.1,"rBolsa":13.5,"rTubo":12.5,"crista":24.84,"lado":[0,0,-1],"raio":25,"B":51.6,"dn2":0},"curva_transposicao-32":{"fam":"AF_Soldavel_Curva de Transposicao","forma":"transposicao","dn":32,"codigo":"22123106","descricao":"Curva de Transposição Soldável 32mm, PVC Marrom, Água Fria - TIGRE","furo":13.9,"L":210.9,"conector":82.85,"rBolsa":17,"rTubo":16,"crista":27.6,"lado":[0,0.05,-1],"raio":25,"B":65.45,"dn2":0}};
  /* PERFIS-TIGRE-FIM */

  /* REALISMO-INICIO */
  var REALISMO = {"joelho90":{"realismo":"ok","dns":{"20":[0.976,0.991,0.994],"25":[0.999,0.993,0.996],"32":[0.998,0.987,0.99],"40":[0.999,0.991,0.993],"50":[0.998,0.993,0.995],"60":[0.998,0.99,0.993],"75":[0.998,0.992,0.994],"85":[0.998,0.993,0.995],"110":[0.997,0.988,0.993]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":0.929,"amanco":0.945,"dn":"25"}},"joelho45":{"realismo":"foto","dns":{},"icone":"foto","dnIcone":25,"foto":"RA-Build/hidro-familias-real/fotos/af_soldavel_marrom/joelho45.png","origemFoto":"Amanco Wavin — FT Agua Fria Soldavel (FTC000001, rev. Out/2025), pág. 18","motivo":"sem gabarito do fabricante para medir (a família só existe a 90° ou em outro DN)","iouFoto":{"tigre":0.941,"amanco":0.941,"dn":"25"}},"curva90":{"realismo":"foto","dns":{"20":[0.927,0.998,0.998],"25":[0.972,1,0.999],"32":[0.97,0.999,0.999],"40":[0.983,0.999,0.999],"50":[0.993,0.985,0.988],"60":[0.976,0.999,0.999],"75":[0.979,0.999,0.997],"85":[0.981,0.999,0.998],"110":[0.994,0.988,0.988]},"icone":"render","dnIcone":25,"foto":"RA-Build/hidro-familias-real/fotos/af_soldavel_marrom/curva90.png","origemFoto":"Amanco Wavin — FT Agua Fria Soldavel (FTC000001, rev. Out/2025), pág. 16","motivo":"silhueta abaixo de 0,97 — pior: DN 20 (topo 0.927, frente 0.998, iso 0.998)","iouFoto":{"tigre":0.905,"amanco":0.871,"dn":"25"}},"curva45":{"realismo":"foto","dns":{},"icone":"foto","dnIcone":25,"foto":"RA-Build/hidro-familias-real/fotos/af_soldavel_marrom/curva45.png","origemFoto":"Amanco Wavin — FT Agua Fria Soldavel (FTC000001, rev. Out/2025), pág. 15","motivo":"sem gabarito do fabricante para medir (a família só existe a 90° ou em outro DN)","iouFoto":{"tigre":0.824,"amanco":0.547,"dn":"25"}},"joelho90_reducao":{"realismo":"ok","dns":{"25x20":[0.972,0.984,0.975],"32x20":[0.999,0.99,0.999]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":0.914,"amanco":0.947,"dn":"25x20"}},"joelho_rosca":{"realismo":"foto","dns":{"20":[0.967,0.99,0.993],"25":[0.99,0.994,0.982],"32":[0.998,0.99,0.995]},"icone":"render","dnIcone":25,"foto":"RA-Build/hidro-familias-real/fotos/af_soldavel_marrom/joelho_rosca.png","origemFoto":"Amanco Wavin — FT Agua Fria Soldavel (FTC000001, rev. Out/2025), pág. 20","motivo":"silhueta abaixo de 0,97 — pior: DN 20 (topo 0.967, frente 0.99, iso 0.993)","iouFoto":{"tigre":0.905,"amanco":0.902,"dn":"25"}},"curva_transposicao":{"realismo":"foto","dns":{"20":[0.94,0.998,0.989],"25":[0.892,0.997,0.973],"32":[0.957,0.985,0.977]},"icone":"foto","dnIcone":25,"foto":"RA-Build/hidro-familias-real/fotos/af_soldavel_marrom/curva_transposicao.png","origemFoto":"Amanco Wavin — FT Agua Fria Soldavel (FTC000001, rev. Out/2025), pág. 17","motivo":"silhueta abaixo de 0,97 — pior: DN 25 (topo 0.892, frente 0.997, iso 0.973)","iouFoto":{"tigre":0.897,"amanco":0.915,"dn":"25"}},"luva":{"realismo":"ok","dns":{"20":[1,0.986,0.993],"25":[1,0.998,0.994],"32":[1,0.997,0.993],"40":[1,0.99,0.992],"50":[1,0.996,0.992],"60":[1,0.994,0.992],"75":[1,0.993,0.991],"85":[1,0.996,0.994],"110":[1,0.991,0.994]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":0.939,"amanco":0.95,"dn":"25"}},"luva_correr":{"realismo":"ok","dns":{"20":[1,0.986,0.993],"25":[1,0.989,0.993],"32":[1,0.987,0.992],"40":[1,0.994,0.991],"50":[1,0.988,0.991],"60":[1,0.995,0.991]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":null,"amanco":0.923,"dn":"25"}},"luva_reducao":{"realismo":"ok","dns":{"25x20":[1,1,1]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":0.933,"amanco":0.915,"dn":"25x20"}},"luva_rosca":{"realismo":"ok","dns":{"20":[1,0.99,0.991],"25":[1,0.991,0.991],"32":[1,0.971,0.997],"40":[1,0.973,0.995],"50":[1,0.974,0.994]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":0.909,"amanco":0.957,"dn":"25"}},"uniao":{"realismo":"ok","dns":{"20":[0.993,0.97,0.991],"25":[0.995,0.978,0.993],"32":[0.998,0.976,0.994],"40":[0.997,0.981,0.994],"50":[0.998,0.983,0.994],"60":[0.999,0.986,0.994],"75":[0.996,0.991,0.994],"85":[0.997,0.989,0.994],"110":[0.998,0.987,0.994]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":0.957,"amanco":0.947,"dn":"25"}},"cruzeta":{"realismo":"foto","dns":{"25":[0.999,0.992,0.996]},"icone":"foto","dnIcone":25,"iouFoto":{"tigre":0.937,"amanco":null,"dn":"25"},"motivo":"visivelmente diferente da FOTO do catálogo nos prints lado a lado (a família do escritório é mais simples que o produto)","foto":"RA-Build/hidro-familias-real/fotos/af_soldavel_marrom/cruzeta__tigre.png","origemFoto":"Tigre — Catalogo Geral Predial 2025, pág. 7"},"te":{"realismo":"ok","dns":{"25":[1,0.997,0.997]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":0.938,"amanco":0.97,"dn":"25"}},"te_reducao":{"realismo":"ok","dns":{"32x25":[1,0.999,0.996],"40x25":[1,0.997,0.995],"50x25":[0.999,0.998,0.996],"60x25":[1,0.998,0.994],"75x25":[1,0.995,0.996],"85x25":[1,0.995,0.996],"110x25":[1,0.998,0.997]},"icone":"render","dnIcone":32,"iouFoto":{"tigre":null,"amanco":0.932,"dn":"32x25"}},"te_rosca":{"realismo":"ok","dns":{"20":[1,0.995,0.998],"25":[1,0.996,0.998],"32":[1,0.996,0.997]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":0.911,"amanco":0.933,"dn":"25"}},"cap":{"realismo":"ok","dns":{"20":[0.998,0.978,0.994],"25":[0.999,0.978,0.994],"32":[0.999,0.978,0.992],"40":[1,0.976,0.991],"50":[1,0.979,0.991],"60":[1,0.977,0.99],"75":[1,0.979,0.989],"85":[1,0.977,0.989],"110":[1,0.979,0.989]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":0.956,"amanco":0.941,"dn":"25"}},"adaptador":{"realismo":"foto","dns":{"20":[0.951,0.944,0.991],"25":[0.951,0.944,0.991],"32":[0.99,0.994,0.985]},"icone":"foto","dnIcone":25,"foto":"RA-Build/hidro-familias-real/fotos/af_soldavel_marrom/adaptador.png","origemFoto":"Amanco Wavin — FT Agua Fria Soldavel (FTC000001, rev. Out/2025), pág. 10","motivo":"silhueta abaixo de 0,97 — pior: DN 20 (topo 0.951, frente 0.944, iso 0.991)","iouFoto":{"tigre":null,"amanco":0.931,"dn":"25"}},"adaptador_caixa":{"realismo":"foto","dns":{},"icone":"foto","dnIcone":20,"foto":"RA-Build/hidro-familias-real/fotos/af_soldavel_marrom/adaptador_caixa.png","origemFoto":"Amanco Wavin — FT Agua Fria Soldavel (FTC000001, rev. Out/2025), pág. 9","motivo":"sem gabarito do fabricante para medir (a família só existe a 90° ou em outro DN)","iouFoto":{"tigre":null,"amanco":0.923,"dn":"20"}},"bucha":{"realismo":"ok","dns":{"32x25":[1,1,0.999]},"icone":"render","dnIcone":32,"iouFoto":{"tigre":0.961,"amanco":0.98,"dn":"32x25"}},"bucha_longa":{"realismo":"ok","dns":{"32x20":[1,1,1]},"icone":"render","dnIcone":32,"iouFoto":{"tigre":0.877,"amanco":0.951,"dn":"32x20"}},"joelho_bucha":{"realismo":"foto","dns":{"20":[0.965,0.986,0.993],"25":[0.993,0.991,0.987],"32":[0.998,0.988,0.996]},"icone":"render","dnIcone":25,"foto":"RA-Build/hidro-familias-real/fotos/af_azul_bucha_latao/joelho_bucha.png","origemFoto":"Amanco Wavin — FT Agua Fria Soldavel (FTC000001, rev. Out/2025), pág. 20","motivo":"silhueta abaixo de 0,97 — pior: DN 20 (topo 0.965, frente 0.986, iso 0.993)","iouFoto":{"tigre":0.922,"amanco":0.892,"dn":"25"}},"luva_bucha":{"realismo":"ok","dns":{"20":[1,0.988,0.991],"25":[1,0.99,0.991],"32":[1,0.981,0.997]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":0.926,"amanco":0.942,"dn":"25"}},"te_bucha":{"realismo":"ok","dns":{"20":[0.999,0.993,0.991],"25":[1,0.994,0.998],"32":[0.998,0.997,0.997]},"icone":"render","dnIcone":25,"iouFoto":{"tigre":0.931,"amanco":0.95,"dn":"25"}}};
  /* REALISMO-FIM */
  function realismo(tipo) { return REALISMO[tipo] || { realismo: "foto", motivo: "sem medida na bancada" }; }

  /* a GRAVAÇÃO no 3D do modelo (nível Alto): a faixa com uv vira uma malha fina com o texto numa textura de canvas — UMA textura
     e UM material por texto (cache), a geometria de cada faixa é pequena (≈ 20 triângulos). Pedido do Rogério (06/11/2026):
     "pode colocar o nome TIGRE nele". */
  var DECAL = { mat: {} };
  /* o MATERIAL da gravação (a mesma para o 3D do modelo, a bancada e o gerador de ícones). Duas leituras da peça real:
     - CONEXÃO (decal.relevo): marcação em relevo da MESMA cor do PVC, só um tom abaixo (marrom mais escuro / azul mais escuro), sem preto;
     - TUBO: a impressão é tinta, escura. O texto sai em cinza e o material multiplica pela cor do corpo (a cor base vem da aparência). */
  function materialDecal(THREE, decal) {
    var tx = decal.texto, relevo = !!decal.relevo, papel = decal.papel === "azul" ? "azul" : "corpo", ch = tx + "|" + (relevo ? "r" + papel : "t"), M = DECAL.mat[ch];
    if (M) return M;
    var cv = document.createElement("canvas"); cv.width = 1024; cv.height = 128; var x = cv.getContext("2d");
    x.clearRect(0, 0, 1024, 128); x.fillStyle = relevo ? "rgb(184,184,184)" : "rgba(38,22,10,0.6)"; x.font = "bold 84px Arial, Helvetica, sans-serif"; var fz = Math.min(84, Math.floor(84 * 990 / Math.max(1, x.measureText(tx).width))); x.font = "bold " + fz + "px Arial, Helvetica, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(tx, 512, 68);
    var t = new THREE.CanvasTexture(cv); if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    /* a cor do material é a do PVC (relevo: ×0,72 do texto cinza dá o tom abaixo): num modo de vista que troca a textura pela cor a faixa some no corpo */
    var corB = (global.HidGeo && global.HidGeo.aparencia ? global.HidGeo.aparencia("pvc_soldavel", "agua_fria", relevo ? papel : undefined).cor : "#6A5442");
    M = DECAL.mat[ch] = new THREE.MeshStandardMaterial({ map: t, color: new THREE.Color(corB), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.6, metalness: 0 });
    M.userData = M.userData || {}; M.userData.corBase = corB;
    M.name = "inst:marcacao";
    return M;
  }
  function malhaDecal(THREE, parte) {
    if (!THREE || !parte || !parte.decal || typeof document === "undefined") return null;
    var M = materialDecal(THREE, parte.decal);
    var g = new THREE.BufferGeometry(), ml = parte.malha;
    g.setAttribute("position", new THREE.Float32BufferAttribute(ml.pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(ml.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(ml.uv, 2)); g.setIndex(ml.idx);
    var me = new THREE.Mesh(g, M); me.userData.decal = true; me.userData.semIfc = true; me.renderOrder = 2; me.raycast = function () {};   /* não rouba o clique da peça */
    return me;
  }
  /* a gravação AO LONGO DO TUBO (TIGRE … DN … NBR 5648), a cada barra — só com o.marcacao */
  function marcaTubo(G, t, inicio, fim, de) {
    var d = sub(fim, inicio), L = Math.sqrt(dot(d, d)) / MM; if (L < 60) return null;
    var dir = nrmz(d), h = Math.min(7, de * 0.28), s0 = Math.max(10, L * 0.5 - 4.5 * h), s1 = s0 + 9 * h;
    if (s1 > L - 5) return null;
    var p = faixaAxial(G, inicio, dir, s0, s1, de / 2, h, "TIGRE  " + t.dn + " mm  NBR 5648  ÁGUA FRIA");
    return p;
  }
  /* faixa com o texto CORRENDO ao longo do eixo (o do tubo): u ao longo, v em volta */
  function faixaAxial(G, C, d, s0, s1, r, h, texto) {
    var m = new G.Malha(), u = perpDe(d), w = cross(d, u), nA = 4, ang = h / Math.max(1, r), uv = [];
    m.abrir();
    for (var i = 0; i <= nA; i++) for (var j = 0; j <= 1; j++) {
      var a = Math.PI / 2 - ang / 2 + ang * i / nA, rad = add(mul(u, Math.cos(a)), mul(w, Math.sin(a))), s = j ? s1 : s0;
      m.v(add(add(C, mul(d, s * MM)), mul(rad, (r + 0.05) * MM)), rad); uv.push(j, 1 - i / nA);
    }
    for (var k = 0; k < nA; k++) { var a0 = k * 2, b0 = (k + 1) * 2; m.t(a0, b0, a0 + 1); m.t(b0, b0 + 1, a0 + 1); }
    m.fechar(); m.uv = uv;
    return { papel: "marcacao", malha: m, decal: { texto: texto } };
  }

  var HidGeoRealAgua = { VERSAO: 2, malhaDecal: malhaDecal, materialDecal: materialDecal, marcaTubo: marcaTubo, COTAS: COTAS, REALISMO: REALISMO, realismo: realismo, TIGRE: TIGRE, medidaTigre: medidaTigre, pontoAgua: pontoAgua, FAB: FAB, BSP: BSP, rosca: rosca, bocaDe: bocaDe, conexao: conexao, simples: simples, FONTE_FICHA: FONTE_FICHA, FONTE_FAB: FONTE_FAB };
  global.HidGeoRealAgua = HidGeoRealAgua;
  if (typeof module !== "undefined" && module.exports) module.exports = HidGeoRealAgua;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

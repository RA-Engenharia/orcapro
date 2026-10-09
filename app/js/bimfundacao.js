/* =====================================================================
 * bimfundacao.js — FUNDAÇÃO ("Fundação: isolada / de parede / laje",
 * categoria Fundações estruturais), motor PURO (ES5, Node).
 *
 * Fase P3, Frente C do plano do BIM (item C4 do backlog:
 * "Fundação" estava "em breve" — toda obra tem fundação, e concreto, fôrma
 * e escavação ficavam fora do orçamento pelo modelo).
 *
 * O QUE ESTÁ AQUI — cinco tipos, cada um com a sua conta:
 *   · SAPATA isolada: B × L × h, reta ou chanfrada (rodapé h0 + tronco até o
 *     topo b × l — volume pelo prismatoide, exato para o tronco de pirâmide);
 *   · BLOCO sobre estacas: B × L × h + 1 a 6 estacas (Ø, comprimento,
 *     espaçamento; arranjos de 1, 2, 3 (triângulo), 4, 5 e 6) — a estaca
 *     nasce no fundo do bloco;
 *   · ESTACA avulsa: Ø × comprimento;
 *   · BALDRAME (viga de fundação): de um ponto a outro, b × h;
 *   · RADIER: contorno qualquer × espessura.
 *   Topo no nível + "deslocamento do topo" (a fundação isolada
 *   fica pendurada do nível); a peça desce dali.
 *
 *   DERIVADOS (o que o orçamento pede e o inventário não tem): fôrma (as faces
 *   laterais: sapata reta e bloco = perímetro × altura; chanfrada = só o
 *   rodapé; baldrame = os dois lados; radier = a borda; estaca escavada não
 *   tem fôrma), LASTRO (espessura × a área da base — padrão 5 cm, o mínimo
 *   da ABNT NBR 6122 para concreto magro sob fundação rasa; a estaca não
 *   leva), ESCAVAÇÃO (a planta da peça + a folga de trabalho de cada lado,
 *   do terreno até o fundo do lastro, parede vertical), REATERRO (a
 *   escavação menos o que a peça e o lastro ocupam abaixo do terreno) e AÇO
 *   pela TAXA (kg/m³ × volume) — sem armadura detalhada (fase posterior).
 *   A taxa de aço NÃO tem padrão: sem ela o aço fica pendente (quem informa
 *   é o projeto estrutural). Folga e cota do terreno também são do
 *   engenheiro: padrão 0 (escava a peça no prumo, terreno no nível).
 *
 * A OP (validada no BimEdit.sanear — gancho "P3" em js/bimedit.js):
 *   {op:"fundacao", id, tipoFundacao:"sapata"|"bloco"|"estaca"|"baldrame"|"radier",
 *    x?, z?, giro?:graus, x1?, z1? (baldrame), contorno?:[{x,z}…] (radier),
 *    largura?, comprimento?, altura?, alturaBase?, larguraTopo?, comprimentoTopo?,
 *    nEstacas?, diametro?, comprimentoEstaca?, espacamento?,
 *    nivelId?, base?, deslocTopo?, taxaAco?, taxaAcoEstaca?, lastro?, folga?, terreno?}
 *   (null apaga o campo). mover/apagar/orcar com o id também passam aqui.
 *   Sem lista dentro de lista (a nuvem recusa).
 *
 * O ESTADO: BimEdit.aplicar devolve `fundacoes` (só quando há op de
 * fundação — o estado das ops antigas fica byte a byte igual).
 *
 * Teste: node tools/test-bimfundacao.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function temChave(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function obj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  var TIPOS = {
    sapata: { rotulo: "Sapata isolada", ifc: "IFCFOOTING", pre: "PAD_FOOTING" },
    bloco: { rotulo: "Bloco sobre estacas", ifc: "IFCFOOTING", pre: "PILE_CAP" },
    estaca: { rotulo: "Estaca", ifc: "IFCPILE", pre: "BORED" },
    baldrame: { rotulo: "Baldrame (viga de fundação)", ifc: "IFCFOOTING", pre: "FOOTING_BEAM" },
    radier: { rotulo: "Radier", ifc: "IFCSLAB", pre: "BASESLAB" }
  };
  /* LASTRO_PADRAO: ABNT NBR 6122 (fundação rasa sobre lastro de concreto
     magro de no mínimo 5 cm). */
  var LASTRO_PADRAO = 0.05;
  var LIM = { dim: [0.05, 50], altura: [0.05, 10], diametro: [0.1, 3], estaca: [0.3, 80], nEstacas: [1, 6], taxa: [0, 1000], lastro: [0, 0.5], folga: [0, 3], desloc: [-50, 50], terreno: [-50, 50], vertices: 200 };

  function pt(p) { return Array.isArray(p) ? [Number(p[0]), Number(p[1])] : (p ? [Number(p.x), Number(p.z)] : [NaN, NaN]); }
  function areaSinal(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function perimetro(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)); } return s; }
  function mapaNiveis(niveis) {
    var m = {};
    arr(niveis).forEach(function (q) { if (q && q.id != null && q.elevacao != null && q.elevacao !== "" && fin(Number(q.elevacao))) m[String(q.id)] = Number(q.elevacao); });
    return m;
  }

  /* as posições das estacas no bloco (coordenadas locais u, w), pelo espaçamento e */
  function arranjo(n, e) {
    var h = e / 2, t = e * Math.sqrt(3) / 6;
    return ({
      1: [[0, 0]],
      2: [[-h, 0], [h, 0]],
      3: [[-h, -t], [h, -t], [0, 2 * t]],
      4: [[-h, -h], [h, -h], [h, h], [-h, h]],
      5: [[-h, -h], [h, -h], [h, h], [-h, h], [0, 0]],
      6: [[-e, -h], [0, -h], [e, -h], [-e, h], [0, h], [e, h]]
    })[n] || [];
  }

  /* o volume de uma peça em PRISMATOIDE (seção retangular que varia linear
     com a altura) entre ya e yb, com a seção a(y)·b(y) */
  function volumeTronco(y0, y1, B0, L0, B1, L1, ya, yb) {
    ya = Math.max(ya, y0); yb = Math.min(yb, y1); if (!(yb > ya)) return 0;
    function sec(y) { var t = (y - y0) / (y1 - y0); return (B0 + (B1 - B0) * t) * (L0 + (L1 - L0) * t); }
    return (yb - ya) / 6 * (sec(ya) + 4 * sec((ya + yb) / 2) + sec(yb));
  }
  function sobreposicao(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

  /* o polígono desloca d para fora (esquadria) — a escavação do radier com folga */
  function deslocar(P, d) {
    if (!(d > 0)) return P.slice();
    var n = P.length, L = [], s = areaSinal(P) > 0 ? 1 : -1;
    for (var k = 0; k < n; k++) {
      var a = P[k], b = P[(k + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.sqrt(dx * dx + dz * dz), nn = [-dz / l * s, dx / l * s];
      L.push({ n: nn, c: nn[0] * a[0] + nn[1] * a[1] - d });
    }
    var Q = [];
    for (var j = 0; j < n; j++) {
      var A = L[(j + n - 1) % n], B = L[j], det = A.n[0] * B.n[1] - A.n[1] * B.n[0];
      if (Math.abs(det) < 1e-12) return null;
      Q.push([(A.c * B.n[1] - A.n[1] * B.c) / det, (A.n[0] * B.c - A.c * B.n[0]) / det]);
    }
    return Q;
  }

  /* ============================================================ CALCULAR */
  function calcular(fonte, niveis) {
    var f = clone(fonte), avisos = [], T = TIPOS[f.tipoFundacao] ? f.tipoFundacao : null;
    f.tipo = "fundacao";
    if (!T) { f.ok = false; f.avisos = ["Tipo de fundação desconhecido."]; zerar(f); return f; }
    var D = TIPOS[T]; f.ifc = D.ifc; f.ifcPre = D.pre; f.rotuloTipo = D.rotulo;
    var M = mapaNiveis(niveis), elev;
    if (f.nivelId != null && temChave(M, String(f.nivelId))) elev = M[String(f.nivelId)];
    else { elev = num(f.base, 0); if (f.nivelId != null && arr(niveis).length) avisos.push("O nível da fundação não existe mais na obra: ficou na cota em que nasceu."); }
    var yTopo = elev + num(f.deslocTopo, 0), yTer = elev + num(f.terreno, 0);
    var folga = Math.max(0, num(f.folga, 0)), eL = T === "estaca" ? 0 : Math.max(0, num(f.lastro, LASTRO_PADRAO));
    f.elevNivel = r6(elev); f.cotaTopo = r6(yTopo); f.cotaTerreno = r6(yTer); f.folgaEf = folga; f.lastroEf = eL;
    var g = Number(num(f.giro, 0)) * Math.PI / 180, cu = Math.cos(g), su = Math.sin(g);
    var cx = num(f.x, 0), cz = num(f.z, 0);
    function W(u, w) { return [cx + u * cu - w * su, cz + u * su + w * cu]; }
    zerar(f);
    var B = num(f.largura, 0), L = num(f.comprimento, 0), H = num(f.altura, 0);
    var planta = null, yFundo = yTopo, vol = 0, volAbaixo = 0, forma = 0, areaBase = 0, per = 0, comp = 0;
    function prismaRet(b, l, h) {
      if (!(b > 0 && l > 0 && h > 0)) return false;
      yFundo = yTopo - h; vol = b * l * h; areaBase = b * l; per = 2 * (b + l); forma = per * h;
      volAbaixo = b * l * sobreposicao(yFundo, yTopo, -Infinity, yTer);
      planta = [W(-b / 2, -l / 2), W(b / 2, -l / 2), W(b / 2, l / 2), W(-b / 2, l / 2)];
      return true;
    }
    if (T === "sapata") {
      if (!(B >= LIM.dim[0] && L >= LIM.dim[0] && H >= LIM.altura[0])) { avisos.push("Sapata: informe largura, comprimento e altura."); return fim(f, avisos); }
      var h0 = num(f.alturaBase, H), bt = num(f.larguraTopo, B), lt = num(f.comprimentoTopo, L);
      if (h0 < H - 1e-9 && (bt < B - 1e-9 || lt < L - 1e-9)) {
        /* CHANFRADA: rodapé h0 reto + tronco de pirâmide até o topo bt × lt */
        if (!(h0 > 0 && bt > 0 && lt > 0 && bt <= B && lt <= L)) { avisos.push("Sapata chanfrada: a altura do rodapé e o topo têm de caber na sapata."); return fim(f, avisos); }
        yFundo = yTopo - H;
        var yR = yFundo + h0;
        vol = B * L * h0 + volumeTronco(yR, yTopo, B, L, bt, lt, yR, yTopo);
        volAbaixo = B * L * sobreposicao(yFundo, yR, -Infinity, yTer) + volumeTronco(yR, yTopo, B, L, bt, lt, -Infinity, yTer);
        areaBase = B * L; per = 2 * (B + L); forma = per * h0;
        planta = [W(-B / 2, -L / 2), W(B / 2, -L / 2), W(B / 2, L / 2), W(-B / 2, L / 2)];
        f.chanfrada = true; f.alturaBaseEf = h0; f.larguraTopoEf = bt; f.comprimentoTopoEf = lt;
        /* o tronco das faces inclinadas (área real, para quem orça a superfície) */
        var dH = H - h0, sb = Math.sqrt(Math.pow((B - bt) / 2, 2) + dH * dH), sl = Math.sqrt(Math.pow((L - lt) / 2, 2) + dH * dH);
        f.areaChanfro = r6((L + lt) * sb + (B + bt) * sl);
      } else {
        prismaRet(B, L, H); f.chanfrada = false;
      }
    } else if (T === "bloco") {
      if (!prismaRet(B, L, H)) { avisos.push("Bloco: informe largura, comprimento e altura."); return fim(f, avisos); }
      var n = Math.round(num(f.nEstacas, 1)), d = num(f.diametro, 0), ce = num(f.comprimentoEstaca, 0), e = num(f.espacamento, 3 * d);
      if (!(n >= 1 && n <= 6 && d > 0 && ce > 0)) { avisos.push("Bloco: informe o número de estacas (1 a 6), o diâmetro e o comprimento."); return fim(f, avisos); }
      var ests = arranjo(n, e).map(function (q) { var p = W(q[0], q[1]); return { x: r6(p[0]), z: r6(p[1]), u: q[0], w: q[1] }; });
      /* a estaca tem de caber no bloco (o eixo + o raio dentro da planta) */
      var fora = ests.filter(function (s) { return Math.abs(s.u) + d / 2 > B / 2 + 1e-9 || Math.abs(s.w) + d / 2 > L / 2 + 1e-9; }).length;
      if (fora) avisos.push(fora + " estaca(s) sai(em) do bloco: aumente o bloco ou diminua o espaçamento.");
      f.estacas = ests.map(function (s) { return { x: s.x, z: s.z }; });
      f.nEstacasEf = n; f.diametroEf = d; f.comprimentoEstacaEf = ce; f.espacamentoEf = e;
      f.volumeEstacas = n * Math.PI * d * d / 4 * ce; f.comprimentoEstacas = n * ce;
      f.cotaPontaEstacas = r6(yFundo - ce);
    } else if (T === "estaca") {
      var d2 = num(f.diametro, 0), c2 = num(f.comprimentoEstaca, 0);
      if (!(d2 > 0 && c2 > 0)) { avisos.push("Estaca: informe o diâmetro e o comprimento."); return fim(f, avisos); }
      yFundo = yTopo - c2; vol = Math.PI * d2 * d2 / 4 * c2; areaBase = Math.PI * d2 * d2 / 4; per = Math.PI * d2; comp = c2;
      f.diametroEf = d2; f.comprimentoEstacaEf = c2; f.comprimentoEstacas = c2; f.volumeEstacas = vol; f.nEstacasEf = 1;
      planta = null;
    } else if (T === "baldrame") {
      var p0 = [cx, cz], p1 = [num(f.x1, NaN), num(f.z1, NaN)];
      if (!fin(p1[0]) || !fin(p1[1])) { avisos.push("Baldrame: informe o ponto final."); return fim(f, avisos); }
      var dx = p1[0] - p0[0], dz = p1[1] - p0[1], Lb = Math.sqrt(dx * dx + dz * dz);
      if (!(Lb >= 0.1 && B > 0 && H > 0)) { avisos.push("Baldrame: comprimento mínimo de 10 cm, largura e altura."); return fim(f, avisos); }
      var ux = dx / Lb, uz = dz / Lb, nx = -uz * B / 2, nz = ux * B / 2;
      yFundo = yTopo - H; vol = B * H * Lb; areaBase = B * Lb; per = 2 * (B + Lb); forma = 2 * H * Lb; comp = Lb;
      volAbaixo = B * Lb * sobreposicao(yFundo, yTopo, -Infinity, yTer);
      planta = [[p0[0] - nx, p0[1] - nz], [p1[0] - nx, p1[1] - nz], [p1[0] + nx, p1[1] + nz], [p0[0] + nx, p0[1] + nz]];
      f.giroEf = Math.atan2(dz, dx) * 180 / Math.PI;
    } else if (T === "radier") {
      var A = dep("BimArq", "./bimarq.js"), v = A ? A.validarPoligono(f.contorno) : { ok: arr(f.contorno).length >= 3, pts: arr(f.contorno).map(pt) };
      if (!v.ok) { avisos.push("Radier: " + (v.motivo || "contorno inválido.")); return fim(f, avisos); }
      if (!(H > 0)) { avisos.push("Radier: informe a espessura."); return fim(f, avisos); }
      planta = v.pts.map(function (q) { return [q[0], q[1]]; });
      areaBase = Math.abs(areaSinal(planta)); per = perimetro(planta);
      yFundo = yTopo - H; vol = areaBase * H; forma = per * H;
      volAbaixo = areaBase * sobreposicao(yFundo, yTopo, -Infinity, yTer);
    }
    f.ok = true;
    f.cotaFundo = r6(yFundo);
    f.planta = planta ? planta.map(function (q) { return { x: r6(q[0]), z: r6(q[1]) }; }) : null;
    f.volume = vol; f.areaForma = forma; f.areaBase = areaBase; f.perimetro = per; f.comprimentoPeca = comp;
    /* lastro: sob a base (a estaca não leva) */
    var aL = T === "estaca" ? 0 : areaBase, yL = yFundo - eL;
    f.lastroArea = eL > 0 ? aL : 0; f.lastroVolume = aL * eL;
    var lastroAbaixo = aL * sobreposicao(yL, yFundo, -Infinity, yTer);
    /* escavação: a planta + a folga, do terreno ao fundo do lastro (a estaca não escava) */
    var prof = T === "estaca" ? 0 : Math.max(0, yTer - yL), aEsc = 0;
    if (T !== "estaca" && planta) {
      if (T === "radier") { var Q = deslocar(planta, folga); aEsc = Q ? Math.abs(areaSinal(Q)) : areaBase + per * folga; }
      else if (T === "baldrame") aEsc = (B + 2 * folga) * (comp + 2 * folga);
      else aEsc = (B + 2 * folga) * (L + 2 * folga);
    }
    f.profundidadeEscavacao = prof; f.areaEscavacao = aEsc;
    f.escavacao = aEsc * prof;
    f.reaterro = Math.max(0, f.escavacao - volAbaixo - lastroAbaixo);
    if (f.escavacao > 0 && volAbaixo + lastroAbaixo > f.escavacao + 1e-9) avisos.push("A peça passa da escavação (confira a folga e a cota do terreno).");
    if (!(prof > 0) && T !== "estaca") f.semEscavacao = true;
    /* aço pela taxa (kg/m³): sem taxa, pendente */
    var tx = num(f.taxaAco, NaN), txE = num(f.taxaAcoEstaca, NaN);
    f.aco = fin(tx) && f.taxaAco !== null ? tx * (T === "estaca" ? f.volumeEstacas : vol) : null;
    f.acoEstacas = T === "bloco" && fin(txE) && f.taxaAcoEstaca !== null ? txE * f.volumeEstacas : null;
    /* caixa para seleção e enquadramento */
    var xs = [], zs = [];
    (planta || [[cx - num(f.diametroEf, 0) / 2, cz - num(f.diametroEf, 0) / 2], [cx + num(f.diametroEf, 0) / 2, cz + num(f.diametroEf, 0) / 2]]).forEach(function (q) { xs.push(q[0]); zs.push(q[1]); });
    f.cx = r6((Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2); f.cz = r6((Math.min.apply(null, zs) + Math.max.apply(null, zs)) / 2);
    return fim(f, avisos);
  }
  function zerar(f) {
    f.volume = 0; f.areaForma = 0; f.areaBase = 0; f.perimetro = 0; f.comprimentoPeca = 0; f.lastroArea = 0; f.lastroVolume = 0;
    f.escavacao = 0; f.reaterro = 0; f.aco = null; f.acoEstacas = null; f.volumeEstacas = 0; f.comprimentoEstacas = 0;
  }
  function fim(f, avisos) {
    if (f.ok !== true) f.ok = false;
    if (avisos.length) f.avisos = avisos; else delete f.avisos;
    return f;
  }

  /* ======================================================== validação */
  function idOk(v) { return (typeof v === "string" && v.length > 0 && v.length <= 120) || fin(v); }
  var NUMS = {
    x: [-1e5, 1e5], z: [-1e5, 1e5], x1: [-1e5, 1e5], z1: [-1e5, 1e5], giro: [-3600, 3600], base: [-10000, 10000],
    largura: LIM.dim, comprimento: LIM.dim, altura: LIM.altura, alturaBase: LIM.altura, larguraTopo: LIM.dim, comprimentoTopo: LIM.dim,
    nEstacas: LIM.nEstacas, diametro: LIM.diametro, comprimentoEstaca: LIM.estaca, espacamento: [0.1, 20],
    deslocTopo: LIM.desloc, taxaAco: LIM.taxa, taxaAcoEstaca: LIM.taxa, lastro: LIM.lastro, folga: LIM.folga, terreno: LIM.terreno
  };
  function opValida(o) {
    if (!o || o.op !== "fundacao" || !idOk(o.id)) return false;
    var algum = false;
    if (o.tipoFundacao !== undefined) { if (!TIPOS[o.tipoFundacao]) return false; algum = true; }
    for (var k in NUMS) {
      if (!NUMS.hasOwnProperty(k) || o[k] === undefined) continue;
      if (o[k] !== null && !(fin(o[k]) && o[k] >= NUMS[k][0] && o[k] <= NUMS[k][1])) return false;
      if (k === "nEstacas" && o[k] !== null && Math.round(o[k]) !== o[k]) return false;
      algum = true;
    }
    if (o.nivelId !== undefined) { if (o.nivelId !== null && !idOk(o.nivelId)) return false; algum = true; }
    if (o.contorno !== undefined) {
      if (o.contorno !== null && !(Array.isArray(o.contorno) && o.contorno.length >= 3 && o.contorno.length <= LIM.vertices && o.contorno.every(function (q) { return obj(q) && fin(q.x) && fin(q.z); }))) return false;
      algum = true;
    }
    return algum;
  }
  var CAMPOS = ["tipoFundacao", "contorno", "nivelId"].concat(Object.keys(NUMS));

  var BimFundacao = {
    TIPOS: TIPOS, LIM: LIM, LASTRO_PADRAO: LASTRO_PADRAO, CAMPOS: CAMPOS,
    arranjo: arranjo, volumeTronco: volumeTronco,
    calcular: calcular,
    opValida: opValida,

    /* a op de uma fundação NOVA (a ferramenta). d = os campos da op */
    op: function (id, d) {
      d = d || {};
      var o = { op: "fundacao", id: id, tipoFundacao: d.tipoFundacao };
      CAMPOS.forEach(function (k) {
        if (k === "tipoFundacao" || d[k] == null || d[k] === "") return;
        if (k === "contorno") o.contorno = arr(d.contorno).map(function (q) { var p = pt(q); return { x: r6(p[0]), z: r6(p[1]) }; });
        else if (k === "nivelId") o.nivelId = String(d.nivelId);
        else if (fin(Number(d[k]))) o[k] = k === "nEstacas" ? Math.round(Number(d[k])) : r6(Number(d[k]));
      });
      return opValida(o) ? o : null;
    },

    /* ---------------------------------------------- ganchos do replay
     * js/bimedit.js (bloco "P3"): aplicarOp → true se valeu; fim publica
     * saida.fundacoes. ctx.p3[id] = "fundacao" (o dono do id). */
    aplicarOp: function (o, ctx) {
      if (!o || !ctx) return false;
      var F = ctx.fundacoes || (ctx.fundacoes = {}), ord = ctx.ordemFu || (ctx.ordemFu = []), dono = ctx.p3 || (ctx.p3 = {});
      if (o.op === "fundacao") {
        if (!opValida(o)) return false;
        if (dono[o.id] && dono[o.id] !== "fundacao") return false;
        var f = F[o.id];
        if (!f) { if (!TIPOS[o.tipoFundacao]) return false; f = F[o.id] = { id: o.id, tipo: "fundacao" }; ord.push(o.id); dono[o.id] = "fundacao"; }
        CAMPOS.forEach(function (k) { if (!temChave(o, k)) return; if (o[k] === null) delete f[k]; else f[k] = clone(o[k]); });
        return true;
      }
      if (dono[o.id] !== "fundacao" || !F[o.id]) return false;
      var a = F[o.id];
      if (o.op === "apagar") { delete F[o.id]; ord.splice(ord.indexOf(o.id), 1); delete dono[o.id]; return true; }
      if (o.op === "orcar") { var E = dep("BimEdit", "./bimedit.js"); a.servicos = E && E.limparServicos ? E.limparServicos(o.servicos) : []; return true; }
      if (o.op === "mover") {
        var dx = num(o.dx, NaN), dz = num(o.dz, NaN);
        if (!(fin(dx) || fin(dz))) {
          if (!(fin(Number(o.cx)) && fin(Number(o.cz)))) return false;
          var ref;
          if (a.tipoFundacao === "radier") { var xs = arr(a.contorno).map(function (q) { return Number(q.x); }), zs = arr(a.contorno).map(function (q) { return Number(q.z); }); ref = [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, zs) + Math.max.apply(null, zs)) / 2]; }
          else if (a.tipoFundacao === "baldrame") ref = [(num(a.x, 0) + num(a.x1, 0)) / 2, (num(a.z, 0) + num(a.z1, 0)) / 2];
          else ref = [num(a.x, 0), num(a.z, 0)];
          dx = Number(o.cx) - ref[0]; dz = Number(o.cz) - ref[1];
        }
        dx = fin(dx) ? dx : 0; dz = fin(dz) ? dz : 0;
        if (a.contorno) a.contorno = arr(a.contorno).map(function (q) { return { x: r6(Number(q.x) + dx), z: r6(Number(q.z) + dz) }; });
        ["x", "x1"].forEach(function (k) { if (fin(Number(a[k]))) a[k] = r6(Number(a[k]) + dx); });
        ["z", "z1"].forEach(function (k) { if (fin(Number(a[k]))) a[k] = r6(Number(a[k]) + dz); });
        return true;
      }
      return false;
    },
    fim: function (ctx, saida, niveis) {
      if (!ctx || !ctx.fundacoes || !saida) return saida;
      saida.fundacoes = arr(ctx.ordemFu).map(function (id) { return calcular(ctx.fundacoes[id], niveis); });
      return saida;
    },

    /* as medidas do orçamento (as do BimEdit.medidasDe). exato: sem a régua de 4 casas */
    medidas: function (el, exato) {
      var R = exato ? function (v) { return v; } : r4, m = {};
      if (!el) return m;
      m.un = 1; m.volume = R(num(el.volume, 0)); m.areaForma = R(num(el.areaForma, 0)); m.area = R(num(el.areaBase, 0)); m.areaBruta = m.area;
      m.comprimento = R(num(el.tipoFundacao === "radier" ? el.perimetro : el.comprimentoPeca, 0));
      m.escavacao = R(num(el.escavacao, 0)); m.reaterro = R(num(el.reaterro, 0));
      if (el.tipoFundacao !== "estaca") { m.lastro = R(num(el.lastroVolume, 0)); m.lastroArea = R(num(el.lastroArea, 0)); }
      if (el.aco != null) m.aco = R(num(el.aco, 0));
      if (el.tipoFundacao === "bloco") { m.estacas = R(num(el.comprimentoEstacas, 0)); m.volumeEstacas = R(num(el.volumeEstacas, 0)); if (el.acoEstacas != null) m.acoEstacas = R(num(el.acoEstacas, 0)); }
      return m;
    }
  };

  global.BimFundacao = BimFundacao;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFundacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

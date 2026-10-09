/* =====================================================================
 * bimforro.js — FORRO, motor PURO (ES5, Node).
 *
 * Fase P2, Frente B do plano do BIM (seções 3.1, 3.7, 3.8 e
 * Anexo B "forro"). Pedido do Rogério (08/10/2026): ter no OrçaPRO as
 * funcionalidades de um modelador completo. O forro vira dinheiro (área de
 * placa, perímetro de tabica/negativo) e não existia no modelador.
 *
 * O QUE ESTÁ AQUI
 *   · Forro por CONTORNO (polígono qualquer, com furos) — a validação é a
 *     da laje por contorno (BimArq.validarPoligono / validarFuro).
 *   · FORRO AUTOMÁTICO por PONTO: um clique dentro da sala e o contorno sai
 *     das PAREDES do modelador, pelas FACES (o "Forro automático"
 *     acha o contorno pelos elementos que delimitam ambientes). É
 *     ASSOCIATIVO: mover a parede refaz o forro no replay. Paredes soltas
 *     dentro da sala (ilhas) viram furos do forro. Só contam as paredes que
 *     passam na cota do forro (base ≤ cota ≤ topo) e que delimitam ambiente
 *     (c.delimitaAmbiente !== false — "Delimitação de ambientes").
 *     A busca da região fechada é deste arquivo (regiaoFechada): não depende
 *     da Frente A (js/bimambiente.js).
 *   · TIPO com CAMADAS (como o tipo de laje/parede): espessura = soma das
 *     camadas. Padrões: "Forro de gesso 12,5 mm" e "Forro de PVC 8 mm".
 *   · Restrições: Nível + "Altura do deslocamento do nível" (padrão 2,60 m —
 *     o CEILING_HEIGHTABOVELEVEL_PARAM do inventário
 *     (template padrão) vale 2600 mm).
 *     A altura é a da FACE DE BAIXO do forro (a face acabada,
 *     a que se vê da sala); as camadas sobem a partir dela.
 *   · Cotas: Área (líquida dos furos), Perímetro (borda + bordas dos furos —
 *     o HOST_PERIMETER_COMPUTED, que é o comprimento de tabica/negativo),
 *     Volume (área × espessura) e Inclinação.
 *   · INCLINAÇÃO (opcional): o forro inclina pela seta de
 *     inclinação do croqui. Aqui: `inclinacao` (graus, 0 a 60) e
 *     `dirInclinacao` (graus no plano, a direção em que o forro SOBE; 0 = +X,
 *     90 = +Z). A borda mais baixa fica na altura do deslocamento (a cauda da
 *     seta na borda, "deslocamento da cauda" 0). Área e perímetro passam a
 *     ser os INCLINADOS (o que se compra de placa e de tabica); a espessura é
 *     medida perpendicular à placa (volume = área inclinada × espessura).
 *     Regra RA ainda não medida na referência (o cenário P2-forro é plano).
 *
 * A OP (validada no BimEdit.sanear — gancho "P2-B" em js/bimedit.js — para
 * uma tela sem este motor nunca jogar fora um forro):
 *   {op:"forro", id, nivelId?, base?, contorno?:[{x,z}…] | ponto?:{x,z},
 *    furos?:[{pts:[{x,z}…]}…], tipoId?, tipoForro?:{id, rotulo, camadas:
 *    [{rotulo, material, e}]}, deslocNivel?, inclinacao?, dirInclinacao?,
 *    delimitaAmbiente?: false}
 *   · delimitaAmbiente = "Delimitação de ambientes" do forro (WALL_ATTR_ROOM_
 *     BOUNDING no inventário, padrão Sim): o forro delimitador
 *     CORTA O VOLUME do ambiente em que está (js/bimambiente.js, FORRO ×
 *     VOLUME — medido na referência de 09/10/2026). false desliga; true/null volta ao
 *     padrão (não fica gravado).
 *   · tipoId = um tipo do catálogo (TIPOS); tipoForro = a FOTO de um tipo
 *     com camadas próprias (como a parede leva a foto do tipo dela).
 *   · id novo: precisa de contorno OU ponto. id que já existe: o que vier
 *     SUBSTITUI o campo (contorno troca o modo para contorno; ponto, para
 *     automático); null apaga o campo (volta ao padrão).
 *   · base = a elevação do nível quando ele foi criado (o forro de uma obra
 *     sem a lista de níveis fica na cota em que nasceu).
 *   · Sem lista dentro de lista (a nuvem recusa): pontos viajam como {x, z};
 *     furo é {pts:[…]}; camada é {rotulo, material, e}.
 *   mover/apagar/orcar com o id de um forro também passam por aqui.
 *
 * O ESTADO: BimEdit.aplicar devolve `forros` (só quando há op de forro — o
 * estado das ops antigas fica byte a byte igual). Cada forro: { id, tipo:
 * "forro", ifc: "IFCCOVERING", modo, nivelId, deslocNivel, cota, contorno,
 * furos, tipoForro, espessura, area, areaBruta, areaFuros, perimetro,
 * volume, inclinacao, ok, avisos… } — e ambienteId (P2 integração: o
 * ambiente em que o forro está, DERIVADO no replay, nunca gravado na op;
 * ver ligarAmbientes).
 *
 * Teste: node tools/test-bimforro.js
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

  /* ------------------------------------------------------------ tipos
     Os tipos de forro do OrçaPRO (nomes da RA, não famílias da Autodesk).
     A espessura É a soma das camadas. A camada traz o material, que o IFC
     (IfcMaterialLayerSet, na integração) e o orçamento usam. */
  var TIPOS = [
    { id: "gesso-12_5", rotulo: "Forro de gesso 12,5 mm",
      camadas: [{ rotulo: "Placa de gesso acartonado", material: "Gesso acartonado", e: 0.0125 }] },
    { id: "pvc-8", rotulo: "Forro de PVC 8 mm",
      camadas: [{ rotulo: "Régua de PVC", material: "PVC", e: 0.008 }] }
  ];
  /* CEILING_HEIGHTABOVELEVEL_PARAM do inventário (template padrão): 2600 mm */
  var DESLOC_PADRAO = 2.6;
  var LIM = { desloc: 200, inclinacao: 60, camada: 0.5, espessura: 0.6, camadas: 12 };
  var JUNTA = 0.001;   /* a ponta unida da parede entra 1 mm na outra (ver retangulo) */

  /* um tipo (do catálogo ou a foto que a op leva) normalizado:
     { id, rotulo, camadas:[{rotulo, material, e}], espessura } ou null */
  function normTipo(t) {
    if (!t || typeof t !== "object") return null;
    var cam = arr(t.camadas).filter(function (k) { return k && fin(Number(k.e)) && Number(k.e) > 0 && Number(k.e) <= LIM.camada; }).slice(0, LIM.camadas)
      .map(function (k) { return { rotulo: txt(k.rotulo).slice(0, 80) || "Camada", material: txt(k.material).slice(0, 80), e: r6(Number(k.e)) }; });
    if (!cam.length) return null;
    var esp = cam.reduce(function (s, k) { return s + k.e; }, 0);
    if (!(esp > 0 && esp <= LIM.espessura)) return null;
    return { id: txt(t.id).slice(0, 60) || "custom", rotulo: txt(t.rotulo).slice(0, 80) || "Forro", camadas: cam, espessura: r6(esp) };
  }
  function tipoCatalogo(id) {
    for (var i = 0; i < TIPOS.length; i++) if (TIPOS[i].id === String(id)) return normTipo(TIPOS[i]);
    return null;
  }

  /* ---------------------------------------------- geometria plana */
  function pt(p) { return Array.isArray(p) ? [Number(p[0]), Number(p[1])] : (p ? [Number(p.x), Number(p.z)] : [NaN, NaN]); }
  function ptObj(p) { return { x: r6(p[0]), z: r6(p[1]) }; }
  function areaSinal(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function perim(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); } return s; }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    var qx = a[0] + t * dx - p[0], qz = a[1] + t * dz - p[1];
    return Math.sqrt(qx * qx + qz * qz);
  }
  /* dentro do polígono; na borda conta como dentro */
  function dentro(p, P) {
    var x = p[0], z = p[1], d = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if (distSeg(p, a, b) < 1e-7) return true;
      if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) d = !d;
    }
    return d;
  }
  /* tira o vértice que está no meio de uma reta (sobra do corte das arestas)
     ou a menos de 20 µm da reta dos vizinhos (o ângulo da parede gravado em
     4 casas deixa degraus de micrômetros) */
  function semColineares(P) {
    var out = P.slice(), mudou = true;
    while (mudou && out.length > 3) {
      mudou = false;
      for (var i = 0; i < out.length; i++) {
        var a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
        if (distSeg(b, a, c) < 2e-5) { out.splice(i, 1); mudou = true; break; }
      }
    }
    return out;
  }

  /* ============================================ REGIÃO FECHADA POR PAREDES
   * O "forro automático": o contorno da região livre que contém o ponto,
   * limitada pela UNIÃO das paredes (cada parede = o retângulo da linha de
   * centro ± meia espessura, do comprimento do eixo). As faces que se veem
   * de dentro da sala são as faces de acabamento.
   *
   * Como (exato, sem raster):
   *   1. as arestas de todos os retângulos, cortadas em todos os cruzamentos
   *      (e nas pontas de quem encosta, e nos trechos colineares);
   *   2. fica só o pedaço que tem parede de UM lado e vazio do OUTRO — a
   *      borda da união (encosto entre duas paredes, de parede dos dois
   *      lados, sai);
   *   3. as faces do grafo plano (semi-arestas, virando sempre o mais à
   *      direita): as laçadas anti-horárias são contornos de face;
   *   4. o contorno é a MENOR laçada anti-horária que contém o ponto; as
   *      laçadas horárias (ilhas: parede solta no meio da sala) cuja menor
   *      laçada envolvente é esse contorno viram furos.
   * paredes: caixas {cx, cz, comprimento, espessura, rotY}; ponto {x,z}|[x,z].
   * Devolve { ok, contorno:[[x,z]] (anti-horário), furos:[[[x,z]]], area } ou
   * { ok:false, motivo }. */
  /* a PEGADA da parede na planta: o retângulo do eixo ou, na parede do
     modelador já unida (BimArq.derivar → c.uniao), o quadrilátero pelas
     retas de corte das pontas — no L em topo a parede que passa cobre o
     quadradinho do canto de DENTRO (sem isso a sala em L ganhava 0,075²).
     Mesmo referencial da caixa (js/bimarq.js): u no eixo, w na espessura;
     reta de corte u = c0 + c1·w. O vão da porta não abre a pegada: a porta
     não interrompe a delimitação do ambiente. */
  function retangulo(c) {
    var co = Math.cos(num(c.rotY, 0)), si = Math.sin(num(c.rotY, 0)), L = num(c.comprimento, 0) / 2, t = num(c.espessura, 0) / 2, cx = num(c.cx, 0), cz = num(c.cz, 0);
    function W(u, w) { return [cx + u * co + w * si, cz - u * si + w * co]; }
    var un = c.uniao || {}, S = un.ini && fin(un.ini.c0) ? un.ini : { c0: -L, c1: 0 }, E = un.fim && fin(un.fim.c0) ? un.fim : { c0: L, c1: 0 };
    function uEm(l, w) { return l.c0 + num(l.c1, 0) * w; }
    var us = [uEm(S, -t), uEm(E, -t), uEm(E, t), uEm(S, t)];
    if (us[1] < us[0]) us[1] = us[0];
    if (us[2] < us[3]) us[2] = us[3];
    /* a ponta que PARA na outra parede (T, a de depois no L em topo,
       meia-esquadria) avança 1 mm para dentro dela: a junta encosta face com
       face, e o ângulo da parede (rotY em 4 casas no BimEdit.parede) deixa
       uma fresta de micrômetros que "vazaria" a sala. A ponta que PASSA (vai
       até a face de lá da outra) não avança — no canto de dentro de uma sala
       em L ela entraria 1 mm na sala. Ponta solta fica exata. */
    if (un.ini && fin(un.ini.c0) && uEm(S, 0) >= -L - 1e-4) { us[0] -= JUNTA; us[3] -= JUNTA; }
    if (un.fim && fin(un.fim.c0) && uEm(E, 0) <= L + 1e-4) { us[1] += JUNTA; us[2] += JUNTA; }
    var R = [W(us[0], -t), W(us[1], -t), W(us[2], t), W(us[3], t)];
    if (areaSinal(R) < 0) R.reverse();
    return R;
  }
  /* estritamente dentro do retângulo convexo anti-horário */
  function dentroEstrito(p, R) {
    for (var i = 0; i < R.length; i++) {
      var a = R[i], b = R[(i + 1) % R.length];
      if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) <= 1e-10) return false;
    }
    return true;
  }
  function regiaoFechada(paredes, ponto) {
    var P0 = pt(ponto);
    if (!fin(P0[0]) || !fin(P0[1])) return { ok: false, motivo: "Ponto inválido." };
    var RS = arr(paredes).filter(function (c) { return c && num(c.comprimento, 0) > 0.01 && num(c.espessura, 0) > 0; });
    /* CURVA: a parede curva (e a reta com ponta em arco) entra pela pegada do js/bimcurva.js — cordas
       numa grade comum por círculo, cada corda com o arco dela (a área exata sai no calcular) */
    var BCf = dep("BimCurva", "./bimcurva.js"), curvas = BCf ? RS.filter(function (c) { return BCf.ehCurva(c); }) : [], arcosF = {}, polis = [];
    if (curvas.length) {
      RS = RS.filter(function (c) { return curvas.indexOf(c) < 0; });
      BCf.contornosAmbiente(curvas).forEach(function (x) { x.pecas.forEach(function (pc) {
        polis.push(pc.pts);
        pc.arestas.forEach(function (e) { if (e.arco) arcosF[BCf.chaveCorda(e.a, e.b)] = { c: e.arco.c, r: e.arco.r }; });
      }); });
    }
    RS = RS.map(retangulo);
    if (!RS.length && !polis.length) return { ok: false, motivo: "Não há paredes na altura do forro para fechar a região." };
    function naUniao(p) {
      for (var i = 0; i < RS.length; i++) if (dentroEstrito(p, RS[i])) return true;
      for (var j = 0; j < polis.length; j++) if (dentro(p, polis[j]) && !polis[j].some(function (q, k) { return distSeg(p, q, polis[j][(k + 1) % polis[j].length]) < 1e-9; })) return true;   /* CURVA */
      return false;
    }
    if (naUniao(P0)) return { ok: false, motivo: "O ponto caiu em cima de uma parede: clique dentro da sala." };
    /* 1. arestas e cortes */
    var E = [];
    RS.forEach(function (R) { for (var i = 0; i < 4; i++) E.push([R[i], R[(i + 1) % 4]]); });
    polis.forEach(function (R) { for (var i = 0; i < R.length; i++) E.push([R[i], R[(i + 1) % R.length]]); });   /* CURVA */
    var segs = [], vistos = {};
    E.forEach(function (e, i) {
      var A = e[0], B = e[1], d = [B[0] - A[0], B[1] - A[1]], L = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
      if (!(L > 1e-9)) return;
      var ts = [0, 1];
      E.forEach(function (f, j) {
        if (j === i) return;
        var C = f[0], D = f[1], e2 = [D[0] - C[0], D[1] - C[1]], den = d[0] * e2[1] - d[1] * e2[0];
        if (Math.abs(den) < 1e-12 * L * Math.max(1e-9, Math.sqrt(e2[0] * e2[0] + e2[1] * e2[1]))) {
          /* paralelas: se colineares, as pontas da outra cortam esta */
          var dC = Math.abs(d[0] * (C[1] - A[1]) - d[1] * (C[0] - A[0])) / L;
          if (dC < 1e-9) [C, D].forEach(function (Q) { var t = ((Q[0] - A[0]) * d[0] + (Q[1] - A[1]) * d[1]) / (L * L); if (t > 1e-9 && t < 1 - 1e-9) ts.push(t); });
          return;
        }
        var t = ((C[0] - A[0]) * e2[1] - (C[1] - A[1]) * e2[0]) / den, s = ((C[0] - A[0]) * d[1] - (C[1] - A[1]) * d[0]) / den;
        if (t > -1e-9 && t < 1 + 1e-9 && s > -1e-9 && s < 1 + 1e-9) ts.push(Math.max(0, Math.min(1, t)));
      });
      ts.sort(function (a, b) { return a - b; });
      var n = [-d[1] / L, d[0] / L], eps = 1e-5;
      for (var k = 0; k + 1 < ts.length; k++) {
        if ((ts[k + 1] - ts[k]) * L < 1e-7) continue;
        var p = [A[0] + d[0] * ts[k], A[1] + d[1] * ts[k]], q = [A[0] + d[0] * ts[k + 1], A[1] + d[1] * ts[k + 1]];
        var M = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        /* 2. só a borda da união: parede de um lado, vazio do outro */
        if (naUniao([M[0] + n[0] * eps, M[1] + n[1] * eps]) === naUniao([M[0] - n[0] * eps, M[1] - n[1] * eps])) continue;
        var k1 = Math.round(p[0] * 1e6) + "," + Math.round(p[1] * 1e6), k2 = Math.round(q[0] * 1e6) + "," + Math.round(q[1] * 1e6);
        var ch = k1 < k2 ? k1 + "|" + k2 : k2 + "|" + k1;
        if (vistos[ch]) continue;
        vistos[ch] = 1; segs.push([p, q]);
      }
    });
    if (!segs.length) return { ok: false, motivo: "O ponto não está numa região fechada por paredes." };
    /* 3. grafo plano: vértices (ímã de 1 µm) e semi-arestas */
    var V = [], saem = [];
    function vert(p) {
      for (var i = 0; i < V.length; i++) if (Math.abs(V[i][0] - p[0]) < 1e-6 && Math.abs(V[i][1] - p[1]) < 1e-6) return i;
      V.push([p[0], p[1]]); saem.push([]); return V.length - 1;
    }
    var H = [];   /* semi-aresta: {de, para, ang, usada} */
    segs.forEach(function (s) {
      var a = vert(s[0]), b = vert(s[1]); if (a === b) return;
      var h1 = { de: a, para: b }, h2 = { de: b, para: a };
      h1.par = h2; h2.par = h1;
      [h1, h2].forEach(function (h) { h.ang = Math.atan2(V[h.para][1] - V[h.de][1], V[h.para][0] - V[h.de][0]); H.push(h); saem[h.de].push(h); });
    });
    saem.forEach(function (l) { l.sort(function (x, y) { return x.ang - y.ang; }); });
    var lacos = [];
    H.forEach(function (h0) {
      if (h0.usada) return;
      var pts = [], h = h0, guarda = 0;
      while (h && !h.usada && guarda++ < 100000) {
        h.usada = true; pts.push(V[h.de]);
        var l = saem[h.para], ix = l.indexOf(h.par);
        h = l[(ix - 1 + l.length) % l.length];
      }
      if (pts.length >= 3) lacos.push({ pts: pts, area: areaSinal(pts) });
    });
    /* 4. o contorno: a menor laçada anti-horária que contém o ponto */
    var pos = lacos.filter(function (l) { return l.area > 1e-9; });
    var cand = pos.filter(function (l) { return dentro(P0, l.pts); }).sort(function (a, b) { return a.area - b.area; });
    if (!cand.length) return { ok: false, motivo: "O ponto não está numa região fechada por paredes (feche a sala ou desenhe o contorno)." };
    var ext = cand[0], furos = [];
    lacos.forEach(function (l) {
      if (!(l.area < -1e-9)) return;
      var A = -l.area;
      var env = pos.filter(function (q) { return q.area > A + 1e-9 && l.pts.every(function (v) { return dentro(v, q.pts); }); }).sort(function (a, b) { return a.area - b.area; })[0];
      if (env === ext) furos.push(semColineares(l.pts));
    });
    var C = semColineares(ext.pts);
    var aF = furos.reduce(function (s, f) { return s + Math.abs(areaSinal(f)); }, 0);
    var rgF = { ok: true, contorno: C, furos: furos, area: Math.abs(areaSinal(C)) - aF };
    if (curvas.length) rgF.arcos = arcosF;   /* CURVA: as cordas que são arco (a área exata sai no calcular) */
    return rgF;
  }
  /* as paredes que delimitam o forro: passam na cota (base ≤ cota ≤ topo) e
     delimitam ambiente */
  function paredesNaCota(caixas, cota) {
    return arr(caixas).filter(function (c) {
      if (!c || c.tipo !== "parede" || c.delimitaAmbiente === false) return false;
      var y0 = num(c.cy, 0) - num(c.altura, 0) / 2, y1 = num(c.cy, 0) + num(c.altura, 0) / 2;
      return y0 <= cota + 1e-6 && y1 >= cota - 1e-6;
    });
  }

  /* ============================================================ derivar */
  function mapaNiveis(niveis) {
    var m = {};
    arr(niveis).forEach(function (n) { if (n && n.id != null && n.elevacao != null && n.elevacao !== "" && fin(Number(n.elevacao))) m[String(n.id)] = Number(n.elevacao); });
    return m;
  }
  function tipoDe(f) { return normTipo(f.tipoForro) || tipoCatalogo(f.tipoId) || normTipo(TIPOS[0]); }
  /* a altura da face de baixo do forro no ponto (x, z) */
  function cotaEm(f, x, z) {
    var th = num(f.inclinacao, 0);
    if (!(th > 0)) return num(f.cota, 0);
    var dr = num(f.dirInclinacao, 0) * Math.PI / 180, ux = Math.cos(dr), uz = Math.sin(dr);
    return num(f.cota, 0) + (x * ux + z * uz - num(f.projMin, 0)) * Math.tan(th * Math.PI / 180);
  }
  /* o forro DERIVADO (a fonte não muda): contorno efetivo, tipo, cotas e
     medidas. Inválido sai com ok:false e o motivo em avisos (aparece na
     tela; não some calado). */
  function calcular(fonte, estado, niveis) {
    var A = dep("BimArq", "./bimarq.js"), f = clone(fonte), avisos = [];
    f.tipo = "forro"; f.ifc = "IFCCOVERING";
    var M = mapaNiveis(niveis), elev;
    if (f.nivelId != null && temChave(M, String(f.nivelId))) elev = M[String(f.nivelId)];
    else {
      elev = num(f.base, 0);
      if (f.nivelId != null && arr(niveis).length) avisos.push("O nível do forro não existe mais na obra: ficou na cota em que nasceu.");
    }
    var desloc = fin(Number(f.deslocNivel)) && f.deslocNivel !== null ? Number(f.deslocNivel) : DESLOC_PADRAO;
    var t = tipoDe(fonte);
    f.tipoForro = t; f.tipoId = t.id; f.espessura = t.espessura;
    f.deslocNivelEf = r6(desloc); f.elevNivel = r6(elev); f.cota = r6(elev + desloc);
    f.inclinacao = fin(Number(fonte.inclinacao)) && fonte.inclinacao !== null ? Math.max(0, Math.min(LIM.inclinacao, Number(fonte.inclinacao))) : 0;
    f.dirInclinacao = fin(Number(fonte.dirInclinacao)) && fonte.dirInclinacao !== null ? Number(fonte.dirInclinacao) : 0;
    f.modo = fonte.ponto && !arr(fonte.contorno).length ? "automatico" : "contorno";
    var C = null, F = [];
    if (!A) avisos.push("O motor do modelador (js/bimarq.js) não carregou.");
    else if (f.modo === "contorno") {
      var v = A.validarPoligono(fonte.contorno);
      if (v.ok) C = v.pts; else avisos.push(v.motivo);
    } else {
      var rg = regiaoFechada(paredesNaCota(estado && estado.caixas, f.cota), fonte.ponto);
      if (rg.ok) { C = rg.contorno; F = rg.furos.slice(); } else avisos.push(rg.motivo);
    }
    /* CURVA: contorno com aresta em arco (o ponto leva m) — o desenho pelas cordas de 2 mm; a área e
       o perímetro exatos pelo js/bimcurva.js (abaixo) */
    var BCc = dep("BimCurva", "./bimcurva.js"), arcosC = null;
    if (BCc && f.modo === "contorno" && BCc.temArco(fonte.contorno) && A) {
      var vc = BCc.contornoValido(fonte.contorno, A);
      if (vc.ok) { C = vc.pts; arcosC = vc.chaves; avisos = avisos.filter(function (x) { return x !== (v && v.motivo); }); }
    }
    if (f.modo !== "contorno" && rg && rg.ok && rg.arcos) arcosC = rg.arcos;
    if (C && A) {
      arr(fonte.furos).forEach(function (fu, i) {
        var vf = A.validarFuro(C, fu && fu.pts, F.map(function (q) { return { pts: q.map(ptObj) }; }));
        if (vf.ok) F.push(vf.pts); else avisos.push("furo " + (i + 1) + " ignorado: " + vf.motivo);
      });
    }
    f.ok = !!C;
    if (!C) {
      f.contorno = arr(fonte.contorno); f.furos = []; f.area = 0; f.areaBruta = 0; f.areaFuros = 0; f.perimetro = 0; f.volume = 0;
      f.avisos = avisos; return f;
    }
    var th = f.inclinacao * Math.PI / 180, k = th > 0 ? 1 / Math.cos(th) : 1, tg = Math.tan(th);
    var dr = f.dirInclinacao * Math.PI / 180, ux = Math.cos(dr), uz = Math.sin(dr);
    function proj(q) { return q[0] * ux + q[1] * uz; }
    f.projMin = r6(th > 0 ? Math.min.apply(null, C.map(proj)) : 0);
    /* perímetro: a borda de verdade (inclinada quando o forro é inclinado) */
    function per3(P) {
      var s = 0;
      for (var i = 0; i < P.length; i++) {
        var a = P[i], b = P[(i + 1) % P.length], dy = (proj(b) - proj(a)) * tg;
        s += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + dy * dy);
      }
      return s;
    }
    var aC = Math.abs(areaSinal(C)), aF = F.reduce(function (s, q) { return s + Math.abs(areaSinal(q)); }, 0);
    var per = per3(C) + F.reduce(function (s, q) { return s + per3(q); }, 0);
    /* CURVA: as cordas que são arco — o segmento circular de cada uma entra (ou sai) da área, e o
       perímetro vai pelo arco (forro plano; no inclinado o perímetro fica pelas cordas de 2 mm) */
    if (arcosC && BCc) {
      var kc = BCc.corrigirArcos(C, arcosC, true), kf = F.map(function (q) { return BCc.corrigirArcos(q, arcosC, false); });
      aC = aC + kc.regiao; aF = F.reduce(function (s, q, i) { return s + Math.abs(areaSinal(q)) - kf[i].regiao; }, 0);
      if (!(th > 0)) per += kc.perimetro + kf.reduce(function (s, x) { return s + x.perimetro; }, 0);
    }
    f.contorno = C.map(ptObj); f.furos = F.map(function (q) { return { pts: q.map(ptObj) }; });
    f.areaBruta = r4(aC * k); f.areaFuros = r4(aF * k); f.area = r4((aC - aF) * k);
    f.perimetro = r4(per); f.volume = r6((aC - aF) * k * t.espessura);
    var xs = C.map(function (q) { return q[0]; }), zs = C.map(function (q) { return q[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
    f.cx = r6((x0 + x1) / 2); f.cz = r6((z0 + z1) / 2); f.comprimento = r6(x1 - x0); f.largura = r6(z1 - z0);
    f.cy = r6(f.cota + t.espessura / 2); f.altura = t.espessura;
    if (avisos.length) f.avisos = avisos; else delete f.avisos;
    return f;
  }

  /* ================================================ FORRO × AMBIENTE
   * P2 (integração, 09/10/2026): em que AMBIENTE (js/bimambiente.js) cada
   * forro está. É DERIVADO no replay — nunca vai para a op: mexeu a parede,
   * o ponto do ambiente ou o forro, a ligação se refaz sozinha.
   * Regra: o ambiente DELIMITADO, no MESMO NÍVEL, cuja região (fora das
   * ilhas) contém o PONTO do forro:
   *   · forro automático → o ponto clicado (o mesmo que achou o contorno);
   *   · forro por contorno → um ponto DENTRO do contorno e fora dos furos (o
   *     centroide de área; no L ou no U, em que o centroide cai fora, o meio
   *     do trecho mais largo de uma linha horizontal que corta o contorno).
   * "Mesmo nível": os dois com nível → o mesmo id; algum sem nível → a face
   * de baixo do forro entre a base e o topo do ambiente.
   * Ambiente redundante ou não delimitado não recebe forro (não tem região).
   * Sem ambiente que sirva, o forro fica sem ambienteId (o acabamento de
   * teto do ambiente vizinho segue pela área do ambiente). */
  function centroideArea(C) {
    var a = 0, cx = 0, cz = 0;
    for (var i = 0, n = C.length; i < n; i++) {
      var p = C[i], q = C[(i + 1) % n], k = p[0] * q[1] - q[0] * p[1];
      a += k; cx += (p[0] + q[0]) * k; cz += (p[1] + q[1]) * k;
    }
    return Math.abs(a) > 1e-12 ? [cx / (3 * a), cz / (3 * a)] : null;
  }
  function pontoInterno(C, furos) {
    function ok(p) { return p && dentro(p, C) && !furos.some(function (F) { return F.length >= 3 && dentro(p, F); }); }
    var g = centroideArea(C);
    if (ok(g)) return g;
    var zs = C.map(function (q) { return q[1]; }), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
    var linhas = [g ? g[1] : (z0 + z1) / 2, 0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875].map(function (f, i) { return i === 0 ? f : z0 + (z1 - z0) * f; });
    for (var k = 0; k < linhas.length; k++) {
      var z = linhas[k], xs = [];
      [C].concat(furos).forEach(function (P) {
        for (var i = 0, n = P.length; i < n; i++) {
          var a = P[i], b = P[(i + 1) % n];
          if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
      });
      xs.sort(function (x, y) { return x - y; });
      var melhor = null;
      for (var j = 0; j + 1 < xs.length; j += 2) if (!melhor || xs[j + 1] - xs[j] > melhor[1] - melhor[0]) melhor = [xs[j], xs[j + 1]];
      if (melhor && melhor[1] - melhor[0] > 1e-6) { var p = [(melhor[0] + melhor[1]) / 2, z]; if (ok(p)) return p; }
    }
    return null;
  }
  /* o ponto que representa o forro na planta (ou null) */
  function pontoDoForro(f) {
    if (!f || f.ok === false) return null;
    if (f.modo === "automatico" && f.ponto && fin(Number(f.ponto.x)) && fin(Number(f.ponto.z))) return [Number(f.ponto.x), Number(f.ponto.z)];
    var C = arr(f.contorno).map(pt);
    if (C.length < 3 || C.some(function (q) { return !fin(q[0]) || !fin(q[1]); })) return null;
    return pontoInterno(C, arr(f.furos).map(function (fu) { return arr(fu && fu.pts).map(pt); }));
  }
  function chaveNivel(v) { return v == null || v === "" ? null : String(v); }
  function mesmoNivel(f, a) {
    var fk = chaveNivel(f.nivelId), ak = chaveNivel(a.nivelId), k = a.calc || {};
    if (fk != null && ak != null) return fk === ak;
    return fin(k.base) && fin(k.topo) && fin(f.cota) && f.cota >= k.base - 1e-6 && f.cota <= k.topo + 1e-6;
  }
  function ambienteDoForro(f, ambientes) {
    var p = pontoDoForro(f); if (!p) return null;
    for (var i = 0; i < ambientes.length; i++) {
      var a = ambientes[i], k = a && a.calc;
      if (!k || k.estado !== "delimitado" || arr(k.contorno).length < 3 || !mesmoNivel(f, a)) continue;
      var C = arr(k.contorno).map(pt);
      if (!dentro(p, C)) continue;
      if (arr(k.furos).some(function (F) { var Q = arr(F).map(pt); return Q.length >= 3 && dentro(p, Q) && !arr(Q).some(function (q, j) { return distSeg(p, q, Q[(j + 1) % Q.length]) < 1e-7; }); })) continue;
      return a;
    }
    return null;
  }
  /* liga os forros do estado aos ambientes (chamado pelo js/bimedit.js
     DEPOIS de forros e ambientes prontos). Só escreve f.ambienteId. */
  function ligarAmbientes(saida) {
    if (!saida || !arr(saida.forros).length) return saida;
    var ambs = arr(saida.ambientes);
    saida.forros.forEach(function (f) {
      if (!f) return;
      delete f.ambienteId;
      var a = ambs.length ? ambienteDoForro(f, ambs) : null;
      if (a) f.ambienteId = String(a.id);
    });
    return saida;
  }

  /* ======================================================== as ops */
  function opValida(o) {
    var E = dep("BimEdit", "./bimedit.js");
    return !!(E && E.opForroValida && E.opForroValida(o));
  }
  var CAMPOS = ["nivelId", "base", "contorno", "ponto", "furos", "tipoId", "tipoForro", "deslocNivel", "inclinacao", "dirInclinacao", "delimitaAmbiente"];
  function pontosObj(l) {
    return arr(l).map(function (p) {
      var q = pt(p), o = { x: r6(q[0]), z: r6(q[1]) };
      if (p && p.m && fin(Number(p.m.x)) && fin(Number(p.m.z))) o.m = { x: r6(Number(p.m.x)), z: r6(Number(p.m.z)) };   /* CURVA: aresta em arco */
      return o;
    });
  }

  var BimForro = {
    TIPOS: TIPOS, DESLOC_PADRAO: DESLOC_PADRAO, LIM: LIM, CAMPOS: CAMPOS,
    tipo: function (id) { return tipoCatalogo(id) || normTipo(TIPOS[0]); },
    normTipo: normTipo,
    regiaoFechada: regiaoFechada,
    paredesNaCota: paredesNaCota,
    calcular: calcular,
    cotaEm: cotaEm,
    opValida: opValida,
    /* P2 integração: forro × ambiente (derivado; ver o bloco FORRO × AMBIENTE) */
    ligarAmbientes: ligarAmbientes,
    ambienteDoForro: ambienteDoForro,
    pontoDoForro: pontoDoForro,

    /* a op de um forro NOVO a partir do que a ferramenta coletou.
       d = { contorno:[{x,z}] | ponto:{x,z}, furos?, tipoId?, tipo?,
             deslocNivel?, inclinacao?, dirInclinacao?, nivelId?, base? } */
    op: function (id, d) {
      d = d || {};
      var o = { op: "forro", id: id };
      if (d.contorno) o.contorno = pontosObj(d.contorno);
      else if (d.ponto) { var q = pt(d.ponto); o.ponto = { x: r6(q[0]), z: r6(q[1]) }; }
      if (arr(d.furos).length) o.furos = arr(d.furos).map(function (f) { return { pts: pontosObj(f && f.pts ? f.pts : f) }; });
      if (d.nivelId != null) o.nivelId = String(d.nivelId);
      if (fin(Number(d.base)) && d.base !== null) o.base = r6(Number(d.base));
      if (d.tipoForro) { var t = normTipo(d.tipoForro); if (t) o.tipoForro = { id: t.id, rotulo: t.rotulo, camadas: t.camadas }; }
      if (d.tipoId != null && !o.tipoForro) o.tipoId = String(d.tipoId);
      ["deslocNivel", "inclinacao", "dirInclinacao"].forEach(function (k) { if (fin(Number(d[k])) && d[k] !== null && d[k] !== "") o[k] = r6(Number(d[k])); });
      if (d.delimitaAmbiente === false) o.delimitaAmbiente = false;
      return opValida(o) ? o : null;
    },
    /* trocar o tipo de um forro (o seletor de tipo da paleta): o tipo do
       catálogo pelo id, ou a foto de um forro que já usa esse tipo */
    opTrocarTipo: function (estado, id, tipoId) {
      if (tipoCatalogo(tipoId)) return { op: "forro", id: id, tipoId: String(tipoId), tipoForro: null };
      var com = arr(estado && estado.forros).filter(function (f) { return f && f.tipoForro && f.tipoForro.id === String(tipoId); })[0];
      if (com) return { op: "forro", id: id, tipoForro: { id: com.tipoForro.id, rotulo: com.tipoForro.rotulo, camadas: clone(com.tipoForro.camadas) } };
      return null;
    },

    /* ---------------------------------------------- ganchos do replay
     * Chamados pelo js/bimedit.js (blocos "P2-B"): aplicarOp → true se a op
     * é deste motor e valeu; fim(ctx, saida, niveis) publica saida.forros
     * DEPOIS das paredes prontas (o automático lê as paredes de agora). */
    aplicarOp: function (o, ctx) {
      if (!o || !ctx) return false;
      var F = ctx.forros || (ctx.forros = {}), ord = ctx.ordemFo || (ctx.ordemFo = []);
      if (o.op === "forro") {
        if (!opValida(o)) return false;
        var f = F[o.id], novo = !f;
        if (novo && !arr(o.contorno).length && !o.ponto) return false;
        if (novo) { f = F[o.id] = { id: o.id, tipo: "forro" }; ord.push(o.id); }   /* tipo "forro": o registro (js/bimparam.js) reconhece a peça */
        CAMPOS.forEach(function (k) {
          if (!temChave(o, k)) return;
          if (o[k] === null) { delete f[k]; return; }
          /* "Delimitação de ambientes": Sim é o padrão — só o Não fica gravado */
          if (k === "delimitaAmbiente") { if (o[k] === false) f[k] = false; else delete f[k]; return; }
          f[k] = clone(o[k]);
        });
        /* contorno e ponto: o último que veio decide o modo */
        if (temChave(o, "contorno") && o.contorno) delete f.ponto;
        else if (temChave(o, "ponto") && o.ponto) delete f.contorno;
        if (temChave(o, "tipoId") && o.tipoId != null && !temChave(o, "tipoForro")) delete f.tipoForro;
        return true;
      }
      var fo = F[o.id]; if (!fo) return false;
      if (o.op === "apagar") { delete F[o.id]; ord.splice(ord.indexOf(o.id), 1); return true; }
      if (o.op === "orcar") {
        var E = dep("BimEdit", "./bimedit.js");
        fo.servicos = E && E.limparServicos ? E.limparServicos(o.servicos) : []; return true;
      }
      if (o.op === "mover") {
        /* deslocamento (dx, dz) ou o novo centro (cx, cz). No automático o
           ponto vai para o lugar clicado: o forro passa a ser o da região de
           lá (se lá houver sala fechada). */
        var dx = num(o.dx, NaN), dz = num(o.dz, NaN);
        if (fo.ponto && !arr(fo.contorno).length) {
          if (fin(dx) || fin(dz)) { fo.ponto = { x: r6(fo.ponto.x + (fin(dx) ? dx : 0)), z: r6(fo.ponto.z + (fin(dz) ? dz : 0)) }; }
          else if (fin(Number(o.cx)) && fin(Number(o.cz))) fo.ponto = { x: r6(Number(o.cx)), z: r6(Number(o.cz)) };
          else return false;
          return true;
        }
        var C = arr(fo.contorno).map(pt); if (!C.length) return false;
        if (!(fin(dx) || fin(dz))) {
          if (!(fin(Number(o.cx)) && fin(Number(o.cz)))) return false;
          var xs = C.map(function (q) { return q[0]; }), zs = C.map(function (q) { return q[1]; });
          dx = Number(o.cx) - (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
          dz = Number(o.cz) - (Math.min.apply(null, zs) + Math.max.apply(null, zs)) / 2;
        }
        dx = fin(dx) ? dx : 0; dz = fin(dz) ? dz : 0;
        fo.contorno = arr(fo.contorno).map(function (p) { var q = pt(p), o2 = { x: r6(q[0] + dx), z: r6(q[1] + dz) }; if (p && p.m) o2.m = { x: r6(num(p.m.x, 0) + dx), z: r6(num(p.m.z, 0) + dz) }; return o2; });   /* CURVA: o meio do arco anda junto */
        fo.furos = arr(fo.furos).map(function (fu) { return { pts: arr(fu && fu.pts).map(function (p) { var q = pt(p); return { x: r6(q[0] + dx), z: r6(q[1] + dz) }; }) }; });
        return true;
      }
      return false;
    },
    fim: function (ctx, saida, niveis) {
      if (!ctx || !ctx.forros || !saida) return saida;
      saida.forros = arr(ctx.ordemFo).map(function (id) { return calcular(ctx.forros[id], saida, niveis); });
      return saida;
    },

    /* as medidas do orçamento (as do BimEdit.medidasDe) */
    medidas: function (f) {
      if (!f) return {};
      return { un: 1, area: r4(num(f.area, 0)), areaBruta: r4(num(f.areaBruta, 0)), comprimento: r4(num(f.perimetro, 0)), volume: r4(num(f.volume, 0)) };
    }
  };

  global.BimForro = BimForro;
  if (typeof module !== "undefined" && module.exports) module.exports = BimForro;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

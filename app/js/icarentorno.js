/* =====================================================================
 * icarentorno.js — O ENTORNO DA OBRA PELO MAPA (ESPEC §II.10.8). Motor PURO, sem rede e sem DOM.
 * Entra a resposta do /ia/geo/entorno (OpenStreetMap pelo Overpass, já filtrada no servidor) e a georreferência do
 * modelo ({ lat, lon, x0, y0, norte } — js/icargeo.js); sai, em METROS DO MODELO:
 *  - propostas no MESMO formato das da planta (js/icarplanta.js volumetria): edificação, muro, água — a tela aceita,
 *    ajusta a altura ou descarta do mesmo jeito, e o aceito vira p.entorno (obstáculo do caminho e do agente);
 *  - redes: trechos de linha elétrica para a tela pedir a ALTURA (o mapa não tem) e conferir a tensão;
 *  - ruas e áreas verdes: só para desenhar e avisar (gramado = solo de patola a conferir).
 *
 * ⚠ ALTURA NUNCA INVENTADA. Ordem: tag height do mapa (medida) → building:levels × alturaPav_m (premissa, ESTIMADA)
 *   → alturaPadrao_m (premissa, ESTIMADA). Linha elétrica sem altura no mapa fica SEM altura: a tela não deixa aceitar
 *   sem a pessoa informar — uma rede desenhada a 0 m some do caminho do içamento e a zona da NR-10 fica errada.
 * ⚠ TENSÃO: só a tag voltage do mapa (em volts; "13800;220" = a MAIOR). Sem ela, kV = null e a tela pede: sem tensão
 *   não há raio da NR-10, e chutar a faixa baixa encolheria a zona de risco.
 * ⚠ O prédio do mapa SOBRE o terreno da obra pode ser a casa que está sendo demolida ou a própria obra mapeada:
 *   vem marcado (sobreModelo) e fora do "aceitar todas".
 * ===================================================================== */
(function (global) {
  "use strict";

  var PREMISSAS = {
    alturaPav_m: 3.0,           // 1 pavimento = 3,00 m (a mesma premissa da planta)
    alturaPadrao_m: 3.0,        // edificação sem altura nem pavimentos no mapa (ESTIMADA)
    alturaMuroPadrao_m: 2.0,    // muro sem altura no mapa (ESTIMADA)
    espessuraMuro_m: 0.20,      // o mapa traz o muro como LINHA: vira faixa desta espessura
    larguraCorrego_m: 3.0,      // córrego/vala sem width no mapa (ESTIMADA) — só para o caminhão não estacionar em cima
    larguraRio_m: 15.0,         // rio sem width no mapa (ESTIMADA)
    larguraFaixa_m: 3.5,        // faixa de rua (lanes × isto quando não há width)
    areaMinEdif_m2: 4,          // abaixo disto é abrigo de medidor, guarita mapeada como ponto…
    maxPropostas: 300           // o mesmo teto do p.entorno do plano
  };
  function prem(p) { var o = {}, k; for (k in PREMISSAS) o[k] = PREMISSAS[k]; if (p) for (k in p) if (p[k] != null && p[k] !== "") o[k] = +p[k]; return o; }
  function br(v, c) { var x = +v; if (!isFinite(x)) return "—"; var f = Math.pow(10, c == null ? 2 : c); return String(Math.round(x * f) / f).replace(".", ","); }
  function r3(v) { return Math.round(v * 1000) / 1000; }

  /* "12", "12 m", "12.5m", "12,5" → 12.5; "40'" (pés) → 12,19; o resto (texto, faixa) → null */
  function metros(v) {
    if (v == null) return null;
    var s = String(v).trim().toLowerCase().replace(",", "."), m;
    if ((m = /^(\d+(?:\.\d+)?)\s*(?:m|meters?|metros?)?$/.exec(s))) return +m[1];
    if ((m = /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)$/.exec(s))) return +m[1] * 0.3048;
    return null;
  }
  /* voltage do OSM: volts, vários circuitos separados por ";" → a MAIOR, em kV */
  function kVdo(tag) {
    if (tag == null || tag === "") return null;
    var vs = String(tag).split(/[;,]/).map(function (x) { return +String(x).trim(); }).filter(function (x) { return x > 0 && isFinite(x); });
    if (!vs.length) return null;
    return Math.max.apply(null, vs) / 1000;
  }

  function area(pol) { var a = 0; for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) a += (pol[j][0] * pol[i][1] - pol[i][0] * pol[j][1]); return a / 2; }
  function dentro(pt, pol) {
    var c = false; for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      var xi = pol[i][0], yi = pol[i][1], xj = pol[j][0], yj = pol[j][1];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function distSeg(px, py, ax, ay, bx, by) { var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0, ex = ax + t * dx - px, ey = ay + t * dy - py; return Math.sqrt(ex * ex + ey * ey); }
  function distLinha(pt, pts, fechada) { var m = Infinity, n = pts.length; for (var i = fechada ? 0 : 1, j = fechada ? n - 1 : 0; i < n; j = i++) m = Math.min(m, distSeg(pt[0], pt[1], pts[j][0], pts[j][1], pts[i][0], pts[i][1])); return m; }
  /* polígono × caixa (retângulo alinhado): algum vértice dentro, algum canto da caixa dentro do polígono, ou aresta cruzando */
  function tocaCaixa(pol, cx) {
    if (!cx) return false;
    var x0 = cx.min[0], y0 = cx.min[1], x1 = cx.max[0], y1 = cx.max[1], i;
    for (i = 0; i < pol.length; i++) if (pol[i][0] >= x0 && pol[i][0] <= x1 && pol[i][1] >= y0 && pol[i][1] <= y1) return true;
    var cantos = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (i = 0; i < 4; i++) if (dentro(cantos[i], pol)) return true;
    for (var a = 0, b = pol.length - 1; a < pol.length; b = a++) for (var k = 0, m = 3; k < 4; m = k++) if (cruza(pol[b], pol[a], cantos[m], cantos[k])) return true;
    return false;
  }
  function cruza(p, q, r, s) {
    function o(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    var d1 = o(r, s, p), d2 = o(r, s, q), d3 = o(p, q, r), d4 = o(p, q, s);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  /* linha → faixa fechada de largura w (offset dos dois lados com a normal média no vértice; esquina limitada a 2× para não estourar) */
  function faixa(pts, w) {
    var n = pts.length, esq = [], dir = [], h = w / 2;
    for (var i = 0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / l, ny = dx / l, f = 1;
      if (i > 0 && i < n - 1) {
        var ux = pts[i][0] - pts[i - 1][0], uy = pts[i][1] - pts[i - 1][1], lu = Math.sqrt(ux * ux + uy * uy) || 1, cs = (nx * -uy / lu + ny * ux / lu);
        f = cs > 0.5 ? 1 / cs : 2;
      }
      esq.push([r3(pts[i][0] + nx * h * f), r3(pts[i][1] + ny * h * f)]); dir.push([r3(pts[i][0] - nx * h * f), r3(pts[i][1] - ny * h * f)]);
    }
    return esq.concat(dir.reverse());
  }
  function comprimento(pts) { var c = 0; for (var i = 1; i < pts.length; i++) { var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1]; c += Math.sqrt(dx * dx + dy * dy); } return c; }

  /* resp = { elementos:[{ id, tags, g:[[lat,lon],…] } | { id, tags, p:[lat,lon] }], atribuicao }
     geo  = { lat, lon, x0, y0, norte } (js/icargeo.js paraMotor)
     opts = { premissas, caixaModelo:{min:[x,y],max:[x,y]}, raio (m, a partir de x0,y0), jaAceitos:['osm:w1',…] } */
  function propostas(resp, geo, opts) {
    opts = opts || {};
    var G = global.IcarGeo; if (!G || !G.paraMotor) return { ok: false, motivo: "falta js/icargeo.js" };
    if (!geo || !isFinite(+geo.lat) || !isFinite(+geo.lon)) return { ok: false, motivo: "a obra ainda não está no mapa: informe a localização antes de buscar o entorno" };
    var pp = prem(opts.premissas), els = (resp && resp.elementos) || [], ja = {};
    (opts.jaAceitos || []).forEach(function (k) { ja[k] = true; });
    var o0 = [+geo.x0 || 0, +geo.y0 || 0], raio = +opts.raio > 0 ? +opts.raio : Infinity, cx = opts.caixaModelo || null;
    function xy(ll) { var q = G.paraMotor(geo, +ll[0], +ll[1]); return [r3(q.x), r3(q.y)]; }
    var props = [], redes = [], ruas = [], verdes = [], postes = [], fora = 0, ignorados = 0;

    els.forEach(function (e) {
      var t = e.tags || {}, fonte = "osm:" + e.id;
      if (e.p) {   // nó: só poste/torre interessa
        if (t.power === "pole" || t.power === "tower") { var q = xy(e.p); if (distLinha(q, [o0, o0], false) <= raio) postes.push({ fonte: fonte, tipo: t.power === "tower" ? "torre" : "poste", x: q[0], y: q[1] }); else fora++; }
        else ignorados++;
        return;
      }
      var g = (e.g || []).map(xy); if (g.length < 2) { ignorados++; return; }
      var fechada = g.length >= 4 && g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1];
      var pol = fechada ? g.slice(0, -1) : null, dist = pol && dentro(o0, pol) ? 0 : distLinha(o0, pol || g, !!pol);
      if (dist > raio) { fora++; return; }
      var nome = t.name ? String(t.name) : "";

      if (t.building && pol) {
        var A = Math.abs(area(pol)); if (A < pp.areaMinEdif_m2) { ignorados++; return; }
        var h = metros(t.height), est = false, mot = ["contorno do mapa (" + br(A, 0) + " m²)"];
        if (h != null) mot.push("altura no mapa: " + br(h, 1) + " m");
        else if (+t["building:levels"] > 0) { h = +t["building:levels"] * pp.alturaPav_m; est = true; mot.push(t["building:levels"] + " pavimento(s) no mapa × " + br(pp.alturaPav_m, 2) + " m = " + br(h, 1) + " m (ESTIMADA)"); }
        else { h = pp.alturaPadrao_m; est = true; mot.push("sem altura nem pavimentos no mapa: " + br(h, 2) + " m (premissa, ESTIMADA)"); }
        var sobre = dist === 0 || tocaCaixa(pol, cx);
        if (sobre) mot.push("⚠ sobre o terreno da obra: pode ser a construção que está sendo demolida ou a própria obra no mapa");
        props.push({ tipo: "edificacao", poligono: pol, area: Math.round(A * 100) / 100, espessura: null, altura: r3(h), alturaEstimada: est, origem: "OpenStreetMap" + (nome ? " · " + nome : ""),
          confianca: h != null && !est ? 0.85 : (est && +t["building:levels"] > 0 ? 0.7 : 0.5), motivos: mot, fonte: fonte, distancia: Math.round(dist * 10) / 10, sobreModelo: sobre, jaAceita: !!ja[fonte] });
        return;
      }
      if (t.barrier === "wall") {
        var hm = metros(t.height), estm = hm == null, linha = pol ? pol.concat([pol[0]]) : g;
        props.push({ tipo: "muro", poligono: faixa(linha, pp.espessuraMuro_m), area: Math.round(comprimento(linha) * pp.espessuraMuro_m * 100) / 100, espessura: pp.espessuraMuro_m,
          altura: estm ? pp.alturaMuroPadrao_m : r3(hm), alturaEstimada: estm, origem: "OpenStreetMap" + (nome ? " · " + nome : ""), confianca: estm ? 0.6 : 0.8,
          motivos: ["muro no mapa, " + br(comprimento(linha), 1) + " m (linha → faixa de " + br(pp.espessuraMuro_m, 2) + " m)", estm ? "sem altura no mapa: " + br(pp.alturaMuroPadrao_m, 2) + " m (premissa, ESTIMADA)" : "altura no mapa: " + br(hm, 2) + " m"],
          fonte: fonte, distancia: Math.round(dist * 10) / 10, sobreModelo: false, jaAceita: !!ja[fonte] });
        return;
      }
      if ((t.natural === "water" && pol) || t.waterway) {
        var pa, ma;
        if (pol && t.natural === "water") { pa = pol; ma = ["espelho d'água no mapa (" + br(Math.abs(area(pol)), 0) + " m²)"]; }
        else if (pol && t.waterway === "riverbank") { pa = pol; ma = ["margem de rio no mapa"]; }
        else {
          var wl = metros(t.width), wEst = wl == null, larg = wEst ? (t.waterway === "river" ? pp.larguraRio_m : pp.larguraCorrego_m) : wl;
          pa = faixa(g, larg); ma = [(t.waterway === "river" ? "rio" : t.waterway === "canal" ? "canal" : "córrego/vala") + " no mapa (linha → faixa de " + br(larg, 1) + " m" + (wEst ? ", largura ESTIMADA" : "") + ")"];
        }
        props.push({ tipo: "agua", poligono: pa, area: Math.round(Math.abs(area(pa)) * 100) / 100, espessura: null, altura: null, alturaEstimada: false, origem: "OpenStreetMap" + (nome ? " · " + nome : ""),
          confianca: 0.8, motivos: ma, fonte: fonte, distancia: Math.round(dist * 10) / 10, sobreModelo: false, jaAceita: !!ja[fonte] });
        return;
      }
      if (t.power === "line" || t.power === "minor_line" || t.power === "cable") {
        var kV = kVdo(t.voltage), subterranea = t.power === "cable";
        if (subterranea) { ignorados++; return; }   // cabo enterrado não encosta na lança (a escavação é outro assunto)
        for (var i = 1; i < g.length; i++) {
          var dI = distSeg(o0[0], o0[1], g[i - 1][0], g[i - 1][1], g[i][0], g[i][1]); if (dI > raio) continue;
          redes.push({ fonte: fonte + ":" + i, nome: (t.power === "line" ? "linha de transmissão" : "rede de distribuição") + (nome ? " " + nome : ""), a: g[i - 1], b: g[i],
            kV: kV, kVDoMapa: kV != null, altura: null, distancia: Math.round(dI * 10) / 10, cabos: t.cables ? +t.cables || null : null, jaAceita: !!ja[fonte + ":" + i] });
        }
        return;
      }
      if (t.highway) {
        var lw = metros(t.width), lanes = +t.lanes > 0 ? +t.lanes : null;
        ruas.push({ fonte: fonte, nome: nome || "", tipo: String(t.highway), pontos: g, largura: lw != null ? lw : (lanes ? lanes * pp.larguraFaixa_m : null), larguraEstimada: lw == null && !!lanes, distancia: Math.round(dist * 10) / 10 });
        return;
      }
      if ((t.leisure === "park" || t.landuse === "grass") && pol) { verdes.push({ fonte: fonte, nome: nome || (t.leisure === "park" ? "praça/parque" : "gramado"), poligono: pol, distancia: Math.round(dist * 10) / 10 }); return; }
      ignorados++;
    });

    /* mais perto primeiro: o teto de 300 corta o longe, nunca o vizinho de muro */
    props.sort(function (a, b) { return a.distancia - b.distancia; });
    var cortadas = props.length > pp.maxPropostas ? props.length - pp.maxPropostas : 0; if (cortadas) props = props.slice(0, pp.maxPropostas);
    redes.sort(function (a, b) { return a.distancia - b.distancia; });
    props.forEach(function (q, i) { q.n = i; });
    var por = {}; props.forEach(function (q) { por[q.tipo] = (por[q.tipo] || 0) + 1; });
    var avisos = [];
    if (redes.some(function (r) { return r.kV == null; })) avisos.push("rede elétrica sem tensão no mapa: informe a tensão (pergunte à concessionária ou leia a placa do poste) — sem ela não há raio da NR-10");
    if (redes.length) avisos.push("o mapa não traz a altura dos cabos: meça ou pergunte à concessionária antes de aceitar a rede");
    if (verdes.some(function (v) { return v.distancia <= 30; })) avisos.push("gramado/praça a menos de 30 m: se a patola for apoiar nele, confira o solo e use placa de apoio");
    if (!els.length) avisos.push("o mapa não tem nada mapeado neste raio — use a planta ou desenhe o entorno à mão");
    return { ok: true, propostas: props, porTipo: por, redes: redes, ruas: ruas, verdes: verdes, postes: postes,
      conta: { elementos: els.length, fora: fora, ignorados: ignorados, cortadas: cortadas }, avisos: avisos, atribuicao: (resp && resp.atribuicao) || "© OpenStreetMap contributors (ODbL)", premissas: pp };
  }

  /* rede aceita no formato do plano (p.redes do js/gestao.js → js/icarcolisao.js): a altura é OBRIGATÓRIA, a tensão também */
  function redeParaPlano(r, altura, kV, base) {
    var h = +altura, v = kV != null && kV !== "" ? +kV : null, b = +base || 0;
    if (!(h > 0)) return { ok: false, motivo: "informe a altura dos cabos (m) — o mapa não traz" };
    if (!(v > 0)) return { ok: false, motivo: "informe a tensão da rede (kV) — sem ela não há raio da NR-10" };
    return { ok: true, rede: { id: "rede" + String(r.fonte || "").replace(/[^a-z0-9]/gi, ""), nome: r.nome || "rede elétrica", kV: v, altura: h, a: [r.a[0], r.a[1], b + h], b: [r.b[0], r.b[1], b + h], fonte: r.fonte || "" } };
  }

  /* ---------- RELEVO (/ia/geo/relevo: cotas[j·n + i], i para LESTE, j para NORTE, grade centrada em rel.lat/rel.lon) ----------
     ⚠ A grade é centrada no ponto que o SERVIDOR arredondou (4 casas, ~11 m): o centro vem da resposta, nunca da obra — senão
       o relevo inteiro escorrega até 11 m em relação ao modelo. */
  function cotaRelevo(rel, geo, x, y) {
    var G = global.IcarGeo; if (!rel || !rel.cotas || !(rel.n >= 2) || !G) return null;
    var q = G.deMotor(geo, x, y), d = G.enu(+rel.lat, +rel.lon, q.lat, q.lon), n = rel.n, p = 2 * rel.raio / (n - 1);
    var fi = (d.e + rel.raio) / p, fj = (d.n + rel.raio) / p;
    if (fi < 0 || fj < 0 || fi > n - 1 || fj > n - 1) return null;
    var i0 = Math.min(n - 2, Math.floor(fi)), j0 = Math.min(n - 2, Math.floor(fj)), u = fi - i0, v = fj - j0, c = rel.cotas;
    return c[j0 * n + i0] * (1 - u) * (1 - v) + c[j0 * n + i0 + 1] * u * (1 - v) + c[(j0 + 1) * n + i0] * (1 - u) * v + c[(j0 + 1) * n + i0 + 1] * u * v;
  }
  /* malha no MOTOR, com z relativo à cota do ponto da obra (x0, y0) + base (a cota do terreno no modelo) */
  function malhaRelevo(rel, geo, base) {
    var G = global.IcarGeo; if (!rel || !rel.cotas || !(rel.n >= 2) || !G) return null;
    var n = rel.n, p = 2 * rel.raio / (n - 1), z0 = cotaRelevo(rel, geo, +geo.x0 || 0, +geo.y0 || 0), b = +base || 0, pos = [], idx = [], mn = Infinity, mx = -Infinity;
    if (z0 == null) return null;
    for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
      var ll = G.deslocar(+rel.lat, +rel.lon, -rel.raio + i * p, -rel.raio + j * p), m = G.paraMotor(geo, ll.lat, ll.lon), z = rel.cotas[j * n + i];
      if (z < mn) mn = z; if (z > mx) mx = z;
      pos.push(r3(m.x), r3(m.y), r3(z - z0 + b));
    }
    for (j = 0; j < n - 1; j++) for (i = 0; i < n - 1; i++) { var a = j * n + i; idx.push(a, a + 1, a + n + 1, a, a + n + 1, a + n); }
    return { pos: pos, idx: idx, n: n, cotaObra: Math.round(z0 * 10) / 10, desnivel: Math.round((mx - mn) * 10) / 10, min: mn, max: mx, passo: Math.round(p * 10) / 10 };
  }

  /* ---------- IMAGEM DE SATÉLITE NO CHÃO (tiles Web Mercator do /ia/geo/imagem) ----------
     O maior zoom (16–18) cujo quadrado de tiles cobre o raio com até `max` tiles. Dentro de algumas centenas de metros o
     Mercator é plano o bastante: a imagem vira um quadrilátero pelos 4 cantos levados ao motor (paraMotor de cada canto).
     ⚠ Teto no 18 (0,5 m/px): no 19 a Esri não tem foto em boa parte do interior e devolve o quadro "sem dados" — e o pedido
       quadruplica. Para ver a obra, 0,5 m/px basta; o detalhe é o modelo. */
  function latLonDoTile(x, y, z) { var nz = Math.pow(2, z), n = Math.PI * (1 - 2 * y / nz); return { lat: Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) * 180 / Math.PI, lon: x / nz * 360 - 180 }; }
  function planoImagem(geo, raio, max) {
    var G = global.IcarGeo; if (!G || !geo) return null;
    max = max || 36; raio = Math.max(30, +raio || 150);
    for (var z = 18; z >= 16; z--) {
      var no = G.deslocar(+geo.lat, +geo.lon, -raio, raio), se = G.deslocar(+geo.lat, +geo.lon, raio, -raio);
      var a = G.tileDe(no.lat, no.lon, z), b = G.tileDe(se.lat, se.lon, z), x0 = Math.floor(a.x), y0 = Math.floor(a.y), x1 = Math.floor(b.x), y1 = Math.floor(b.y);
      var nx = x1 - x0 + 1, ny = y1 - y0 + 1;
      if (nx * ny > max && z > 16) continue;
      var tiles = []; for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) tiles.push({ z: z, x: x0 + i, y: y0 + j });
      return { z: z, x0: x0, y0: y0, nx: nx, ny: ny, tiles: tiles, resolucao_m: Math.round(G.resolucao(+geo.lat, z) * 100) / 100 };
    }
    return null;
  }
  /* cantos do mosaico no motor, na ordem NO, NE, SE, SO (a imagem: canto superior esquerdo = NO) */
  function cantosImagem(geo, pl) {
    var G = global.IcarGeo; if (!G || !pl) return null;
    return [[pl.x0, pl.y0], [pl.x0 + pl.nx, pl.y0], [pl.x0 + pl.nx, pl.y0 + pl.ny], [pl.x0, pl.y0 + pl.ny]].map(function (t) {
      var ll = latLonDoTile(t[0], t[1], pl.z), m = G.paraMotor(geo, ll.lat, ll.lon); return [r3(m.x), r3(m.y)];
    });
  }

  var IcarEntorno = { PREMISSAS: PREMISSAS, propostas: propostas, redeParaPlano: redeParaPlano, metros: metros, kVdo: kVdo, faixa: faixa, tocaCaixa: tocaCaixa, cotaRelevo: cotaRelevo, malhaRelevo: malhaRelevo,
    latLonDoTile: latLonDoTile, planoImagem: planoImagem, cantosImagem: cantosImagem };
  global.IcarEntorno = IcarEntorno;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarEntorno;
})(typeof window !== "undefined" ? window : this);

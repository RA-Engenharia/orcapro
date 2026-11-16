/* =====================================================================
 * bimtuboprevia.js — PRÉVIA REAL DO TUBO ENQUANTO SE DESENHA (16/11/2026). Motor puro: sem THREE, sem DOM, sem relógio.
 *
 * O pedido (print do Rogério, planta, Tubo AF DN 25): ao desenhar tubo à mão aparecia só uma linha fina azul com "1,34 m · 45°"
 * e o tubo só nascia no 2º clique. Agora, durante o arraste, a planta e o 3D mostram o TUBO — com a largura do DE do material,
 * a cor do sistema — e as CONEXÕES que o clique vai criar (joelho onde o traço muda de direção, tê onde o ponto cai sobre outro
 * tubo). A cota viva (distância · ângulo) continua a do editor.
 *
 *   deTubo(cfg)                      largura do tubo em METROS: o DE do material (HidGeo.cotasTubo) ou, no retangular, a largura
 *   faixa(p1, p2, de)                o retângulo do tubo em planta: { pts:[4 × {x,z}], L, graus }
 *   eixo3d(p1, p2)                   centro, comprimento e direção unitária do cilindro no 3D: { c:{x,y,z}, L, dir:{x,y,z} }
 *   conexoes(trechos, p1, p2, o)     as conexões previstas: [{ tipo:"joelho"|"te", x, z, y?, graus, dn }]
 *   simbolo(tipo, dn, de)            descritor de desenho da conexão, de um CACHE por tipo|dn|DE (mesmo objeto a cada chamada)
 *   preparar(cfg, trechos, p1, p2, geo)   tudo de uma vez para o quadro: { de, cor, faixa, eixo, conexoes }
 *
 * GEOMETRIA REAPROVEITADA: este motor não cria nada na cena. Quem desenha (planta SVG, 3D THREE) cria o segmento de prévia UMA VEZ
 * e só troca posição/escala/rotação a cada movimento; as conexões vêm do cache `simbolo` (uma por tipo/DN).
 *
 * Teste: node tools/test-bimtuboprevia.js
 * ===================================================================== */
(function (global) {
  "use strict";
  var TOL_PT = 0.02;        /* m: duas pontas "no mesmo lugar" */
  var TOL_PARAL = 10;       /* graus: abaixo disto o tubo é prolongamento/paralelo, não ramal */
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function hyp(x, z) { return Math.sqrt(x * x + z * z); }

  /* a largura do tubo em metros: o DE do material (mm) — tubo redondo; seção retangular (eletrocalha, duto de chapa) usa a largura */
  function deTubo(cfg, geo, materiais) {
    cfg = cfg || {};
    var M = materiais && cfg.material ? materiais[cfg.material] : null;
    if (M && M.secao === "retangular") return Math.max(0.01, num(cfg.larg, num(M.larg, 0.4)));
    var de = null;
    try { var ct = geo && geo.cotasTubo ? geo.cotasTubo(cfg.material, cfg.dn) : null; if (ct && ct.de > 0) de = ct.de / 1000; } catch (e) { de = null; }
    if (!(de > 0)) de = Math.max(0.01, num(cfg.dn, 20) / 1000);   /* sem tabela: o DN em mm como o melhor palpite (nunca invisível) */
    return de;
  }

  function faixa(p1, p2, de) {
    var dx = p2.x - p1.x, dz = p2.z - p1.z, L = hyp(dx, dz), h = de / 2;
    if (!(L > 1e-9)) return { pts: [], L: 0, graus: 0 };
    var nx = dz / L * h, nz = -dx / L * h;
    return { pts: [{ x: r4(p1.x + nx), z: r4(p1.z + nz) }, { x: r4(p2.x + nx), z: r4(p2.z + nz) }, { x: r4(p2.x - nx), z: r4(p2.z - nz) }, { x: r4(p1.x - nx), z: r4(p1.z - nz) }],
      L: L, graus: Math.atan2(-dz, dx) * 180 / Math.PI };
  }

  function eixo3d(p1, p2) {
    var y1 = num(p1.y, 0), y2 = num(p2.y, y1), dx = p2.x - p1.x, dy = y2 - y1, dz = p2.z - p1.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(L > 1e-9)) return { c: { x: p1.x, y: y1, z: p1.z }, L: 0, dir: { x: 1, y: 0, z: 0 } };
    return { c: { x: (p1.x + p2.x) / 2, y: (y1 + y2) / 2, z: (p1.z + p2.z) / 2 }, L: L, dir: { x: dx / L, y: dy / L, z: dz / L } };
  }

  function mesmoPonto(a, b, y1, y2) {
    if (hyp(a.x - b.x, a.z - b.z) > TOL_PT) return false;
    return y1 == null || y2 == null || Math.abs(y1 - y2) <= TOL_PT;
  }

  /* a distância do ponto ao segmento (planta) e o parâmetro t (0..1) do pé da perpendicular */
  function sobreSegmento(p, a, b) {
    var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz; if (!(L2 > 1e-12)) return null;
    var t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2, tt = Math.max(0, Math.min(1, t));
    return { t: t, d: hyp(a.x + tt * dx - p.x, a.z + tt * dz - p.z), L: Math.sqrt(L2) };
  }
  function anguloEntre(ax, az, bx, bz) {
    var la = hyp(ax, az), lb = hyp(bx, bz); if (!(la > 1e-9) || !(lb > 1e-9)) return 0;
    var c = (ax * bx + az * bz) / (la * lb); return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
  }

  /* As conexões que vão nascer com o trecho p1→p2.
     trechos: [{ p1:{x,y,z}, p2, sistema, dn }]; o: { sistema, dn }.
     JOELHO: no p1, onde um trecho do MESMO sistema chega e o novo sai noutra direção (cadeia: o clique anterior). 90° e 45° pelo ângulo de
       mudança de direção; outro ângulo vira "curva" com o ângulo real — a prévia diz o que o motor vai fazer, não um joelho inventado.
     TÊ: no p1 ou no p2, quando o ponto cai no MEIO de outro trecho do mesmo sistema (não na ponta, não paralelo). */
  function conexoes(trechos, p1, p2, o) {
    o = o || {}; var out = [], T = Array.isArray(trechos) ? trechos : [];
    if (!p1 || !p2 || !(hyp(p2.x - p1.x, p2.z - p1.z) > 1e-6 || Math.abs(num(p2.y, 0) - num(p1.y, 0)) > 1e-6)) return out;
    var dx = p2.x - p1.x, dz = p2.z - p1.z, y1 = p1.y == null ? null : p1.y;
    var mesmoSis = function (t) { return !o.sistema || !t.sistema || t.sistema === o.sistema; };
    /* joelho no p1 */
    var jogou = false;
    T.forEach(function (t) {
      if (jogou || !t || !t.p1 || !t.p2 || !mesmoSis(t)) return;
      var fim = null, ini = null;
      if (mesmoPonto(t.p2, p1, t.p2.y, y1)) { fim = t.p2; ini = t.p1; }
      else if (mesmoPonto(t.p1, p1, t.p1.y, y1)) { fim = t.p1; ini = t.p2; }
      if (!fim) return;
      var vx = fim.x - ini.x, vz = fim.z - ini.z;           /* o sentido de chegada */
      if (!(hyp(vx, vz) > 1e-6)) return;                     /* trecho vertical: o joelho de coluna é do motor de conexões, não da prévia da planta */
      var g = anguloEntre(vx, vz, dx, dz);                   /* mudança de direção: 0° = segue reto */
      if (g < 1) return;                                     /* reto: sem conexão (luva, se for o caso) */
      if (g > 179) return;                                   /* volta sobre si mesmo: não há conexão que faça */
      out.push({ tipo: "joelho", x: r4(p1.x), z: r4(p1.z), y: y1, graus: Math.round(g * 10) / 10, dn: o.dn || t.dn || null });
      jogou = true;
    });
    /* tê no p1 e no p2 */
    [p1, p2].forEach(function (p, i) {
      var py = p.y == null ? null : p.y, outro = i === 0 ? p2 : p1;
      for (var k = 0; k < T.length; k++) {
        var t = T[k]; if (!t || !t.p1 || !t.p2 || !mesmoSis(t)) continue;
        var ps = sobreSegmento(p, t.p1, t.p2); if (!ps) continue;
        var raio = Math.max(TOL_PT, (o.de || 0) / 2);
        if (ps.d > raio) continue;
        if (ps.t * ps.L <= TOL_PT || (1 - ps.t) * ps.L <= TOL_PT) continue;   /* na ponta: é encontro de pontas, não tê */
        if (py != null && t.p1.y != null && t.p2.y != null) {
          var yy = t.p1.y + ps.t * (t.p2.y - t.p1.y); if (Math.abs(yy - py) > Math.max(TOL_PT, (o.de || 0))) continue;
        }
        var g2 = anguloEntre(t.p2.x - t.p1.x, t.p2.z - t.p1.z, outro.x - p.x, outro.z - p.z); if (g2 > 90) g2 = 180 - g2;
        if (g2 < TOL_PARAL) continue;
        out.push({ tipo: "te", x: r4(p.x), z: r4(p.z), y: py, graus: Math.round(g2 * 10) / 10, dn: o.dn || t.dn || null, hospede: t.id || null, hx: t.p2.x - t.p1.x, hz: t.p2.z - t.p1.z });
        break;
      }
    });
    return out;
  }

  /* CACHE de símbolo por tipo|dn|DE: o mesmo objeto a cada chamada (quem desenha guarda o nó pelo `chave`) */
  var _cache = {}, _fez = 0;
  function simbolo(tipo, dn, de) {
    var chave = tipo + "|" + dn + "|" + r4(de), s = _cache[chave];
    if (s) { s.acertos++; return s; }
    _fez++;
    s = { chave: chave, tipo: tipo, dn: dn, de: de, acertos: 0,
      /* joelho: o corpo é um disco de ~1,25 × DE; tê: o disco + a barra do tubo-tronco (3 × DE) sobre o hospedeiro */
      raio: r4(de * 0.65), barra: tipo === "te" ? r4(de * 3) : 0,
      /* no 3D: raio da esfera do joelho e comprimento/raio do toco do tê */
      r3d: r4(de * 0.6), toco: tipo === "te" ? r4(de * 2.4) : 0 };
    _cache[chave] = s; return s;
  }
  function cacheStats() { return { criados: _fez, tamanho: Object.keys(_cache).length }; }

  function preparar(cfg, trechos, p1, p2, geo, materiais, sistemas) {
    var de = deTubo(cfg, geo, materiais), S = sistemas && cfg ? sistemas[cfg.sistema] : null;
    var cx = conexoes(trechos, p1, p2, { sistema: cfg && cfg.sistema, dn: cfg && cfg.dn, de: de });
    cx.forEach(function (c) { c.simbolo = simbolo(c.tipo, c.dn, de); });
    return { de: de, cor: (S && S.cor) || "#2d6a9c", faixa: faixa(p1, p2, de), eixo: eixo3d(p1, p2), conexoes: cx };
  }

  var API = { deTubo: deTubo, faixa: faixa, eixo3d: eixo3d, conexoes: conexoes, simbolo: simbolo, cacheStats: cacheStats, preparar: preparar, TOL_PT: TOL_PT };
  global.BimTuboPrevia = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));

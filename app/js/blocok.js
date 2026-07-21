/* =====================================================================
 * blocok.js — motor PURO do sistema Blocok (paredes prontas de painel 90×90).
 * Sem DOM, sem three: Node-testável. Faz a paginação das placas por parede
 * (numeradas, com recortes de borda e desconto de vãos), a tabela de material
 * (placas + insumos) e a carga que a parede lança na fundação.
 *
 * ⚠️ HONESTIDADE: os coeficientes de insumo por m² e o peso por espessura são
 * DEFAULTS EDITÁVEIS marcados como "a confirmar" — os números reais vêm do
 * fabricante/franqueado (Blocok/Argecon). O motor nunca chuta como se fosse oficial.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Blocok = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PLACA = 0.90; // m — face padrão do painel Blocok (90×90 cm)
  var ESPESSURAS = [10, 13, 15, 20]; // cm (13 e 15 = fechamento padrão)

  function r3(n) { return Math.round(n * 1000) / 1000; }
  function r6(n) { return Math.round(n * 1e6) / 1e6; }

  // -------- paginação de UMA parede --------
  // Preenche a face L×H com placas 0,90×0,90 numeradas em linhas (base→topo,
  // esq→dir). A última coluna/linha vira RECORTE (dimensão real informada).
  // vaos = [{x,y,w,h}] em metros, origem no canto inferior-esquerdo da parede
  // (porta/janela): placa 100% dentro de um vão não existe (é abertura).
  function paginar(o) {
    o = o || {};
    var L = Math.max(0, +o.comprimento || 0), H = Math.max(0, +o.altura || 0), P = +o.placa || PLACA;
    var vaos = o.vaos || [];
    if (L < 0.01 || H < 0.01) return vazio(L, H);
    var nc = Math.max(1, Math.ceil(r6(L / P))), nl = Math.max(1, Math.ceil(r6(H / P)));
    var placas = [], id = 0, inteiras = 0, recortes = 0, areaPlacas = 0;
    for (var r = 0; r < nl; r++) {
      for (var c = 0; c < nc; c++) {
        var x = c * P, y = r * P;
        var w = Math.min(P, r6(L - x)), h = Math.min(P, r6(H - y));
        if (w <= 0.005 || h <= 0.005) continue;               // sobra desprezível
        if (dentroDeVao(x, y, w, h, vaos)) continue;          // placa dentro da abertura
        id++;
        var rec = (w < P - 0.005 || h < P - 0.005);
        placas.push({ n: id, col: c, lin: r, x: r3(x), y: r3(y), w: r3(w), h: r3(h), tipo: rec ? 'recorte' : 'inteira' });
        if (rec) recortes++; else inteiras++;
        areaPlacas += w * h;
      }
    }
    var areaVaos = vaos.reduce(function (s, v) { return s + Math.max(0, +v.w || 0) * Math.max(0, +v.h || 0); }, 0);
    return {
      comprimento: r3(L), altura: r3(H), placa: P, colunas: nc, linhas: nl, placas: placas,
      inteiras: inteiras, recortes: recortes, total: placas.length,
      areaParede: r3(L * H), areaVaos: r3(areaVaos), areaLiquida: r3(Math.max(0, L * H - areaVaos)), areaPlacas: r3(areaPlacas)
    };
  }
  function vazio(L, H) { return { comprimento: r3(L || 0), altura: r3(H || 0), placa: PLACA, colunas: 0, linhas: 0, placas: [], inteiras: 0, recortes: 0, total: 0, areaParede: 0, areaVaos: 0, areaLiquida: 0, areaPlacas: 0 }; }
  function dentroDeVao(x, y, w, h, vaos) {
    for (var i = 0; i < vaos.length; i++) {
      var v = vaos[i];
      if (x >= (v.x - 0.005) && y >= (v.y - 0.005) && (x + w) <= (v.x + v.w + 0.005) && (y + h) <= (v.y + v.h + 0.005)) return true;
    }
    return false;
  }

  // -------- peso da placa (kg) por espessura --------
  // Faces 2×1,5cm constantes + núcleo EPS variável. SEM tabela oficial → usa a
  // MÉDIA informada (46 kg) como default editável por espessura.
  function pesoPlaca(espCm, tabelaPeso) {
    if (tabelaPeso && tabelaPeso[espCm] != null) return +tabelaPeso[espCm];
    return 46; // "peso médio por peça" informado — editar quando tiver a tabela real
  }

  // -------- consolida material de VÁRIAS paredes (placas + peso de compra) --------
  // paredes = [{ id, comprimento, altura, espessura, pag(resultado de paginar) }]
  // coefs = { pesoPorEsp:{10:..,13:..} } — peso por placa (compra), EDITÁVEL. Insumos vão em insumos().
  function material(paredes, coefs) {
    coefs = coefs || {};
    var porEsp = {}, totInteiras = 0, totRecortes = 0, totPlacas = 0, areaTotal = 0, pesoTotal = 0;
    (paredes || []).forEach(function (pr) {
      var esp = +pr.espessura || 15, pg = pr.pag || paginar(pr);
      var k = String(esp);
      if (!porEsp[k]) porEsp[k] = { espessura: esp, inteiras: 0, recortes: 0, placas: 0, area: 0, peso: 0 };
      var pesoP = pesoPlaca(esp, coefs.pesoPorEsp);
      porEsp[k].inteiras += pg.inteiras; porEsp[k].recortes += pg.recortes; porEsp[k].placas += pg.total;
      porEsp[k].area += pg.areaPlacas; porEsp[k].peso += pg.total * pesoP;
      totInteiras += pg.inteiras; totRecortes += pg.recortes; totPlacas += pg.total;
      areaTotal += pg.areaPlacas; pesoTotal += pg.total * pesoP;
    });
    Object.keys(porEsp).forEach(function (k) { porEsp[k].area = r3(porEsp[k].area); porEsp[k].peso = r3(porEsp[k].peso); });
    return {
      porEspessura: Object.keys(porEsp).sort(function (a, b) { return a - b; }).map(function (k) { return porEsp[k]; }),
      totalInteiras: totInteiras, totalRecortes: totRecortes, totalPlacas: totPlacas,
      areaPlacas: r3(areaTotal), pesoTotalKg: r3(pesoTotal), pesoTotalT: r3(pesoTotal / 1000)
    };
  }

  // -------- INSUMOS (estimativa técnica parametrizável, derivada da geometria) --------
  // Deriva os insumos da SEÇÃO do painel: 2 faces de micro concreto (traço editável) + núcleo EPS +
  // junta de assentamento. Separa PRODUÇÃO das placas (a fábrica do franqueado molda a placa CHEIA
  // e o corte vira retalho → por placa cheia) de MONTAGEM/assentamento (na obra → por m² instalado,
  // conforme a JUNTA escolhida). São ESTIMATIVAS de referência EDITÁVEIS (traço/junta), não números
  // oficiais da fábrica — o franqueado ajusta os coeficientes; nada fica em branco.
  function insumoDefaults() {
    return {
      faceCm: 1.5,                 // espessura de CADA face de micro concreto (cm) — 2 faces
      epsDensidade: 13,            // kg/m³ do EPS (informativo)
      mix: { cimento: 380, areia: 0.50, pedrisco: 0.45, aditivo: 5.7, agua: 170 }, // por m³ de micro concreto
      junta: { tipo: 'cola', colaKgM2: 1.5, gapCm: 1.0, comprimentoMporM2: 2.2, argamassaDensidade: 1800 }
    };
  }
  function insumos(paredes, cfg) {
    var d = insumoDefaults(); cfg = cfg || d;
    var faceCm = (cfg.faceCm != null) ? +cfg.faceCm : d.faceCm, faceM = faceCm / 100;
    var mix = cfg.mix || d.mix, junta = cfg.junta || d.junta;
    var compJunta = (junta.comprimentoMporM2 != null) ? +junta.comprimentoMporM2 : d.junta.comprimentoMporM2;
    var concretoVol = 0, epsVol = 0, colaKg = 0, argVol = 0, areaCheia = 0, areaInst = 0;
    (paredes || []).forEach(function (pr) {
      var pg = pr.pag || paginar(pr), espM = (+pr.espessura || 15) / 100;
      var aCheia = pg.total * (PLACA * PLACA);       // placa CHEIA produzida (retalho incluso)
      var aInst = pg.areaPlacas;                     // área instalada (líquida)
      areaCheia += aCheia; areaInst += aInst;
      concretoVol += aCheia * (2 * faceM);           // 2 faces de micro concreto
      epsVol += aCheia * Math.max(0, espM - 2 * faceM);
      if (junta.tipo === 'cola') colaKg += aInst * ((junta.colaKgM2 != null) ? +junta.colaKgM2 : d.junta.colaKgM2);
      else if (junta.tipo === 'argamassa') argVol += aInst * compJunta * (((junta.gapCm != null) ? +junta.gapCm : d.junta.gapCm) / 100) * espM;
    });
    var producao = [
      { nome: 'Cimento CP-V (micro concreto)', unid: 'kg', total: r3(concretoVol * (+mix.cimento || 0)) },
      { nome: 'Areia industrial', unid: 'm³', total: r3(concretoVol * (+mix.areia || 0)) },
      { nome: 'Pedrisco', unid: 'm³', total: r3(concretoVol * (+mix.pedrisco || 0)) },
      { nome: 'Aditivo polimérico', unid: 'kg', total: r3(concretoVol * (+mix.aditivo || 0)) },
      { nome: 'EPS antichama (núcleo)', unid: 'm³', total: r3(epsVol) },
      { nome: 'Água (referência de traço)', unid: 'L', total: r3(concretoVol * (+mix.agua || 0)) }
    ];
    var montagem = [];
    if (junta.tipo === 'cola') montagem.push({ nome: 'Adesivo/argamassa polimérica (cordão de junta)', unid: 'kg', total: r3(colaKg) });
    else if (junta.tipo === 'argamassa') {
      var argDens = (junta.argamassaDensidade != null) ? +junta.argamassaDensidade : d.junta.argamassaDensidade;
      montagem.push({ nome: 'Argamassa polimérica de junta preenchida', unid: 'kg', total: r3(argVol * argDens) });
      montagem.push({ nome: 'Argamassa polimérica de junta preenchida', unid: 'm³', total: r3(argVol) });
    }
    return {
      juntaTipo: junta.tipo, areaCheia: r3(areaCheia), areaInstalada: r3(areaInst),
      concretoVol: r3(concretoVol), epsVol: r3(epsVol), producao: producao, montagem: montagem
    };
  }

  // -------- carga na fundação --------
  // Cada parede lança seu PESO PRÓPRIO como carga LINEAR (kg/m) na linha da
  // fundação sob ela. (Peso próprio Blocok apenas — NÃO inclui laje/telhado/uso;
  // é a parcela das paredes, declarada.) Converte p/ kN/m (÷ 9,81/1000... = ×0,00981).
  function cargaFundacao(paredes, coefs) {
    coefs = coefs || {};
    var linhas = (paredes || []).map(function (pr) {
      var esp = +pr.espessura || 15, pg = pr.pag || paginar(pr);
      // PESO PRÓPRIO REAL na fundação = ÁREA de placa efetivamente INSTALADA × densidade
      // superficial (kg/m² = peso de 1 placa cheia ÷ área da placa 0,81 m²). O recorte lança só
      // a fração instalada — o retalho cortado é DESCARTADO, não fica na parede. (A COMPRA usa
      // placa cheia; ver material(). Usar total×pesoPlaca aqui superestimaria a carga.)
      var densM2 = pesoPlaca(esp, coefs.pesoPorEsp) / (PLACA * PLACA);
      var peso = pg.areaPlacas * densM2;
      var L = pg.comprimento || +pr.comprimento || 0;
      var kgm = L > 0.01 ? peso / L : 0;
      // cargaKNm: kg/m × 9,81 m/s² = N/m → ÷1000 = kN/m  → kgm × 0,00981
      return { id: pr.id || null, comprimento: r3(L), altura: r3(pg.altura || +pr.altura || 0), espessura: esp,
        placas: pg.total, areaPlacas: r3(pg.areaPlacas), pesoKg: r3(peso), cargaKgM: r3(kgm), cargaKNm: r3(kgm * 0.00981) };
    });
    var pesoTotal = linhas.reduce(function (s, l) { return s + l.pesoKg; }, 0);
    return { linhas: linhas, pesoTotalKg: r3(pesoTotal), pesoTotalT: r3(pesoTotal / 1000) };
  }

  // -------- mão de obra por RENDIMENTO (estimativa de montagem) --------
  // Blocok monta rápido (−50% prazo vs alvenaria). Estima equipe/dias/Hh a partir de um rendimento
  // EDITÁVEL (placas/dia por equipe). res = { totalPlacas, areaPlacas } (de material()). Custo opcional.
  function maoDeObraDefaults() {
    return { placasDiaEquipe: 40, pessoasEquipe: 2, nEquipes: 1, jornadaH: 8, custoHh: 0 };
  }
  function maoDeObra(res, cfg) {
    var d = maoDeObraDefaults(); cfg = cfg || d;
    var pde = Math.max(1, +cfg.placasDiaEquipe || d.placasDiaEquipe);
    var neq = Math.max(1, +cfg.nEquipes || d.nEquipes);
    var pes = Math.max(1, +cfg.pessoasEquipe || d.pessoasEquipe);
    var jor = Math.max(1, +cfg.jornadaH || d.jornadaH);
    var custoHh = Math.max(0, +cfg.custoHh || 0);
    var totalPlacas = Math.max(0, +(res && res.totalPlacas) || 0);
    var area = Math.max(0, +(res && res.areaPlacas) || 0);
    var prodDia = pde * neq;                                  // placas/dia (todas as equipes)
    var dias = prodDia > 0 ? Math.ceil(totalPlacas / prodDia) : 0;
    var hh = dias * jor * pes * neq;                          // homem-hora
    return {
      placasDiaEquipe: pde, nEquipes: neq, pessoasEquipe: pes, jornadaH: jor,
      producaoDia: prodDia, dias: dias, pessoasTotal: pes * neq, Hh: hh,
      m2PorDia: dias > 0 ? r3(area / dias) : 0, placasPorHh: hh > 0 ? r3(totalPlacas / hh) : 0,
      custoHh: custoHh, custoTotal: r3(hh * custoHh)
    };
  }

  // -------- logística (transporte por peso) --------
  // res = { totalPlacas, pesoTotalKg } (de material(), peso de COMPRA). cfg editável.
  function logisticaDefaults() { return { pesoViagemKg: 5000, placasPallet: 25 }; }
  function logistica(res, cfg) {
    var d = logisticaDefaults(); cfg = cfg || d;
    var pvg = Math.max(1, +cfg.pesoViagemKg || d.pesoViagemKg);
    var ppl = Math.max(1, +cfg.placasPallet || d.placasPallet);
    var peso = Math.max(0, +(res && res.pesoTotalKg) || 0), total = Math.max(0, +(res && res.totalPlacas) || 0);
    return {
      pesoTotalKg: r3(peso), pesoTotalT: r3(peso / 1000), pesoViagemKg: pvg,
      viagens: peso > 0 ? Math.ceil(peso / pvg) : 0, placasPallet: ppl,
      pallets: total > 0 ? Math.ceil(total / ppl) : 0,
      placasPorViagemMedia: peso > 0 ? Math.round(total / Math.max(1, Math.ceil(peso / pvg))) : 0
    };
  }

  // -------- atribui cada vão (porta/janela) à parede DONA --------
  // paredes = [{ L, esp, H, yMin, p1:[x,z], ux, uz }] (frame de base da parede, do OBB)
  // aberturas = [{ cx, cz, y0, y1, sx, sz }] (AABB de mundo da porta/janela)
  // Cada abertura é descontada de UMA única parede: a de menor distância perpendicular à sua linha
  // de base (entre as candidatas cuja espessura+folga alcança o vão e cujo "along" cai no vão). Isso
  // evita descontar a MESMA abertura de paredes paralelas próximas (fachada dupla, geminada como 2
  // IfcWall, shaft, gesso encostado) — o que subestimaria material E carga na fundação. Preenche
  // parede.vlist (clip SIMÉTRICO nas 2 bordas) e devolve quantos vãos foram atribuídos.
  function distribuirVaos(paredes, aberturas, folga) {
    folga = (folga == null) ? 0.20 : folga;
    (paredes || []).forEach(function (w) { w.vlist = []; });
    var det = 0;
    (aberturas || []).forEach(function (v) {
      var dono = null, melhorPerp = Infinity, alongDono = 0;
      (paredes || []).forEach(function (w) {
        var rx = v.cx - w.p1[0], rz = v.cz - w.p1[1];
        var along = rx * w.ux + rz * w.uz, perp = Math.abs(-rx * w.uz + rz * w.ux);
        if (perp > (w.esp / 2 + folga)) return;      // fora da espessura desta parede (+ folga)
        if (along < -0.2 || along > w.L + 0.2) return;
        if (perp < melhorPerp) { melhorPerp = perp; dono = w; alongDono = along; }
      });
      if (!dono) return;
      var wv = Math.max(+v.sx || 0, +v.sz || 0);
      var x0 = Math.max(0, alongDono - wv / 2), x1 = Math.min(dono.L, alongDono + wv / 2);       // clip X nas 2 bordas
      var y0 = Math.max(0, Math.min(dono.H, (+v.y0 || 0) - dono.yMin));                          // clip Y nas 2 bordas
      var y1 = Math.max(0, Math.min(dono.H, (+v.y1 || 0) - dono.yMin));                          // (janela mais alta que a parede não estoura o topo)
      if ((x1 - x0) < 0.2 || (y1 - y0) < 0.2) return;
      dono.vlist.push({ x: r3(x0), y: r3(y0), w: r3(x1 - x0), h: r3(y1 - y0) }); det++;
    });
    return det;
  }

  // -------- OBB 2D no plano XZ (extrai comprimento×espessura + eixo da parede) --------
  // PCA nos pontos (x,z) da malha da parede → direção principal = comprimento,
  // perpendicular = espessura. Devolve também a LINHA de base (p1→p2) p/ a fundação.
  function obb2dXZ(pts) {
    var n = pts.length; if (!n) return null;
    var mx = 0, mz = 0, i;
    for (i = 0; i < n; i++) { mx += pts[i][0]; mz += pts[i][1]; }
    mx /= n; mz /= n;
    var sxx = 0, szz = 0, sxz = 0;
    for (i = 0; i < n; i++) { var dx = pts[i][0] - mx, dz = pts[i][1] - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
    sxx /= n; szz /= n; sxz /= n;
    var theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);         // ângulo do eixo principal
    var cs = Math.cos(theta), sn = Math.sin(theta);
    var uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (i = 0; i < n; i++) {
      var ax = pts[i][0] - mx, az = pts[i][1] - mz;
      var u = ax * cs + az * sn, v = -ax * sn + az * cs;      // projeção nos 2 eixos
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
    var comp = uMax - uMin, esp = vMax - vMin;
    if (esp > comp) { var t = comp; comp = esp; esp = t; theta += Math.PI / 2; cs = Math.cos(theta); sn = Math.sin(theta); } // eixo maior = comprimento
    var uc = (uMin + uMax) / 2, vc = (vMin + vMax) / 2;
    // recomputa extent no eixo já corrigido (comprimento ao longo de cs,sn)
    uMin = Infinity; uMax = -Infinity;
    for (i = 0; i < n; i++) { var bx = pts[i][0] - mx, bz = pts[i][1] - mz; var uu = bx * cs + bz * sn; if (uu < uMin) uMin = uu; if (uu > uMax) uMax = uu; }
    comp = uMax - uMin;
    var cx = mx + (cs * uc - sn * vc), cz = mz + (sn * uc + cs * vc);
    var p1 = [mx + cs * uMin, mz + sn * uMin], p2 = [mx + cs * uMax, mz + sn * uMax]; // linha de base
    return { cx: r3(cx), cz: r3(cz), comprimento: r3(comp), espessura: r3(esp), dir: [r3(cs), r3(sn)], p1: [r3(p1[0]), r3(p1[1])], p2: [r3(p2[0]), r3(p2[1])] };
  }

  // espessura da parede (m) → espessura Blocok mais próxima (cm)
  function espBlocok(espM) {
    var cm = espM * 100, melhor = ESPESSURAS[0], dmin = Infinity;
    ESPESSURAS.forEach(function (e) { var d = Math.abs(e - cm); if (d < dmin) { dmin = d; melhor = e; } });
    return melhor;
  }

  return { PLACA: PLACA, ESPESSURAS: ESPESSURAS, paginar: paginar, pesoPlaca: pesoPlaca, material: material, insumos: insumos, insumoDefaults: insumoDefaults, maoDeObra: maoDeObra, maoDeObraDefaults: maoDeObraDefaults, logistica: logistica, logisticaDefaults: logisticaDefaults, cargaFundacao: cargaFundacao, distribuirVaos: distribuirVaos, obb2dXZ: obb2dXZ, espBlocok: espBlocok };
});

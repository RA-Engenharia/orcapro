/* =====================================================================
 * sondagem.js — motor puro da SONDAGEM SPT da obra (NBR 6484:2020)
 *
 * O que faz (sem tela, sem 3D — testável em Node):
 *   • normaliza o boletim (furos, camadas, golpes a cada 15 cm, N-SPT,
 *     nível d'água, unidades geotécnicas) e diz o que falta;
 *   • classifica cada camada pela tabela da NBR 6484 (fofo … muito
 *     compacto; muito mole … dura) e marca o SOLO CRÍTICO;
 *   • calcula a capacidade de uma estaca a cada profundidade pelos métodos
 *     semiempíricos de Aoki-Velloso (1975) e Décourt-Quaresma (1978/1996)
 *     com fator de segurança global (NBR 6122:2019) — a "régua" do
 *     simulador: até onde a estaca tem de ir para aguentar a carga;
 *   • monta os volumes 3D das unidades geotécnicas entre os furos
 *     (interpolação pelo inverso da distância) em coordenadas do IFC.
 *
 * ⚠ A capacidade reproduz, número a número, o cálculo em Python que gerou o
 *   memorial de fundação (mesma discretização de 5 cm, mesmos limites de N,
 *   mesmo arredondamento "meio para o par" do Python na cota da ponta). O
 *   teste confere os dois; se alguém "simplificar" a conta aqui, o simulador
 *   passa a mostrar uma profundidade diferente da do projeto assinado.
 * ⚠ Método semiempírico é ESTIMATIVA: a tela diz isso, mostra os dois
 *   métodos e nunca esconde o menor.
 * ===================================================================== */
(function (global) {
  'use strict';

  /* tipos de solo: cor do 3D e do perfil, parâmetros de Aoki-Velloso (K kPa, α)
     e o C de Décourt-Quaresma (kPa). Fonte: tabelas originais dos métodos. */
  var TIPOS = {
    vegetal:              { nome: 'Camada vegetal',          cor: '#6b8e3a', grupo: 'areia',  K: 1000, alfa: 0.014, C: 400 },
    aterro:               { nome: 'Aterro',                  cor: '#b08d57', grupo: 'areia',  K: 700,  alfa: 0.024, C: 250 },
    areia:                { nome: 'Areia',                   cor: '#f1d98a', grupo: 'areia',  K: 1000, alfa: 0.014, C: 400 },
    areia_siltosa:        { nome: 'Areia siltosa',           cor: '#ead28e', grupo: 'areia',  K: 800,  alfa: 0.020, C: 400 },
    areia_silto_argilosa: { nome: 'Areia silto-argilosa',    cor: '#d9c48d', grupo: 'areia',  K: 700,  alfa: 0.024, C: 250 },
    areia_argilosa:       { nome: 'Areia argilosa',          cor: '#d6b97c', grupo: 'areia',  K: 600,  alfa: 0.030, C: 250 },
    silte:                { nome: 'Silte',                   cor: '#c9b39a', grupo: 'argila', K: 400,  alfa: 0.030, C: 200 },
    silte_argiloso:       { nome: 'Silte argiloso',          cor: '#c9a98a', grupo: 'argila', K: 230,  alfa: 0.034, C: 200 },
    silte_arenoso:        { nome: 'Silte arenoso',           cor: '#d7c29a', grupo: 'argila', K: 550,  alfa: 0.022, C: 250 },
    argila:               { nome: 'Argila',                  cor: '#9fb7a0', grupo: 'argila', K: 200,  alfa: 0.060, C: 120 },
    argila_arenosa:       { nome: 'Argila arenosa',          cor: '#b5c29a', grupo: 'argila', K: 350,  alfa: 0.024, C: 120 },
    argila_siltosa:       { nome: 'Argila siltosa',          cor: '#a4b0a5', grupo: 'argila', K: 220,  alfa: 0.040, C: 120 },
    argila_organica:      { nome: 'Argila orgânica',         cor: '#6f6a73', grupo: 'argila', K: 200,  alfa: 0.060, C: 120, organica: true }
  };
  var AV_F1 = 1.75, AV_F2 = 3.50;   // estaca cravada (pré-moldada / madeira por analogia)

  /* NBR 6484:2020, anexo A: índice de resistência à penetração → designação */
  function designacao(N, grupo) {
    if (N == null || isNaN(N)) return '';
    if (grupo === 'argila') {
      if (N <= 2) return 'muito mole'; if (N <= 5) return 'mole'; if (N <= 10) return 'média';
      if (N <= 19) return 'rija'; if (N <= 30) return 'muito rija'; return 'dura';
    }
    if (N <= 4) return 'fofa'; if (N <= 8) return 'pouco compacta'; if (N <= 18) return 'medianamente compacta';
    if (N <= 40) return 'compacta'; return 'muito compacta';
  }

  function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }

  /* arredondamento "meio para o par" — o round() do Python (ver ⚠ no topo) */
  function roundPar(x) {
    var f = Math.floor(x), d = x - f;
    if (Math.abs(d - 0.5) < 1e-9) return (f % 2 === 0) ? f : f + 1;
    return Math.round(x);
  }

  /* ---------------------------------------------------------------- *
   * normalizar — o registro que a tela e o 3D consomem, e o que falta
   * ---------------------------------------------------------------- */
  function normalizar(d) {
    d = d || {};
    var avisos = [];
    var furos = (d.furos || []).map(function (f, i) {
      f = f || {};
      var id = String(f.id || ('SP-' + (i < 9 ? '0' : '') + (i + 1)));
      var camadas = (f.camadas || []).map(function (c) {
        var tipo = TIPOS[c.tipo] ? c.tipo : null;
        if (!tipo) avisos.push(id + ': tipo de solo "' + c.tipo + '" desconhecido — tratado como areia (a favor da tela, não do cálculo)');
        return { de: num(c.de), ate: num(c.ate), descricao: String(c.descricao || ''), tipo: tipo || 'areia', unidade: c.unidade || null };
      }).filter(function (c) { return c.de != null && c.ate != null && c.ate > c.de; });
      camadas.sort(function (a, b) { return a.de - b.de; });
      var spt = (f.spt || []).map(function (s) {
        var g = (s.golpes || []).map(num), p = (s.pen || []).map(num);
        var N = num(s.N);
        if (N == null && g.length >= 3) N = (g[1] || 0) + (g[2] || 0);
        return { prof: num(s.prof), golpes: g, pen: p, N: N == null ? null : N, bruto: s.bruto || null };
      }).filter(function (s) { return s.prof != null; });
      spt.sort(function (a, b) { return a.prof - b.prof; });
      var fim = num(f.fim);
      if (fim == null && camadas.length) fim = camadas[camadas.length - 1].ate;
      if (!spt.length) avisos.push(id + ': sem ensaios SPT');
      if (num(f.na) == null) avisos.push(id + ': nível d\'água não informado');
      var pos = f.posicao || {};
      if (pos.x == null || pos.y == null) avisos.push(id + ': sem posição no modelo — o 3D usa uma posição esquemática');
      return {
        id: id, nome: f.nome || id, na: num(f.na), naData: f.naData || '', fim: fim, inicio: f.inicio || '', termino: f.termino || '',
        coordenadas: f.coordenadas || '', datum: f.datum || '', criterioParada: f.criterioParada || '',
        equipe: f.equipe || {}, avanco: f.avanco || [], camadas: camadas, spt: spt,
        posicao: { x: num(pos.x), y: num(pos.y), zBoca: num(pos.zBoca), fonte: pos.fonte || '' }
      };
    });
    return {
      id: d.id || null, nome: d.nome || 'Sondagem', empresa: d.empresa || '', trabalho: d.trabalho || '', data: d.data || '', norma: d.norma || 'NBR 6484:2020',
      local: d.local || '', equipamento: d.equipamento || {}, unidades: d.unidades || [], furos: furos, avisos: avisos,
      area: d.area || null, obs: d.obs || ''
    };
  }

  function furo(s, id) { return (s.furos || []).filter(function (f) { return f.id === id; })[0] || null; }

  function camadaEm(f, z) {
    var cs = f.camadas || [];
    for (var i = 0; i < cs.length; i++) if (cs[i].de <= z && z < cs[i].ate) return cs[i];
    return cs.length ? cs[cs.length - 1] : null;
  }

  /* N do ensaio mais próximo: o ensaio da cota i representa o metro centrado em i */
  function mapaN(f) {
    var m = {}, max = 0;
    (f.spt || []).forEach(function (s) { var i = Math.round(s.prof); if (i >= 1 && s.N != null) { m[i] = s.N; if (i > max) max = i; } });
    return { m: m, max: max };
  }
  function Nz(M, z) { var i = Math.max(1, Math.min(roundPar(z), M.max)); return M.m[i] != null ? M.m[i] : 0; }

  /* classifica cada camada (N médio dos ensaios dentro dela) e marca o crítico:
     argila orgânica, ou N ≤ 2 em argila, ou N ≤ 4 em areia (fofa). */
  function classificar(f) {
    return (f.camadas || []).map(function (c) {
      var Ns = (f.spt || []).filter(function (s) { return s.prof >= c.de && s.prof <= c.ate && s.N != null; }).map(function (s) { return s.N; });
      var Nm = Ns.length ? Ns.reduce(function (a, b) { return a + b; }, 0) / Ns.length : null;
      var T = TIPOS[c.tipo] || TIPOS.areia;
      var crit = !!T.organica || (Nm != null && ((T.grupo === 'argila' && Nm <= 2) || (T.grupo === 'areia' && Nm <= 4 && c.ate > 1)));
      return { de: c.de, ate: c.ate, descricao: c.descricao, tipo: c.tipo, cor: T.cor, grupo: T.grupo, Nmedio: Nm, Nmin: Ns.length ? Math.min.apply(null, Ns) : null,
               designacao: designacao(Nm == null ? null : Math.round(Nm), T.grupo), critico: crit, unidade: c.unidade };
    });
  }

  /* ---------------------------------------------------------------- *
   * capacidade de UMA estaca com comprimento cravado L (m)
   *   est = { dFuste, dPonta, ignorarTopo }   (m)
   *   par = { F1, F2, FS }
   * ---------------------------------------------------------------- */
  function capacidade(f, L, est, par) {
    est = est || {}; par = par || {};
    var D = est.dFuste || 0.20, Dp = est.dPonta || 0.16, ign = est.ignorarTopo != null ? est.ignorarTopo : 0.5;
    var F1 = par.F1 || AV_F1, F2 = par.F2 || AV_F2, FS = par.FS || 2.0;
    var U = Math.PI * D, Ap = Math.PI * Dp * Dp / 4;
    var M = mapaN(f), dz = 0.05, z = ign, QlAv = 0;
    while (z < L - 1e-9) {
      var h = Math.min(dz, L - z), zm = z + h / 2;
      var c = camadaEm(f, zm), T = TIPOS[c ? c.tipo : 'areia'];
      QlAv += U * h * T.alfa * T.K * Nz(M, zm) / F2;
      z += h;
    }
    var Ns = [];
    for (var i = 1; i <= Math.floor(L); i++) if (i < L - 0.5 && i <= M.max && M.m[i] != null) Ns.push(Math.min(50, Math.max(3, M.m[i])));
    var Nsm = Ns.length ? Ns.reduce(function (a, b) { return a + b; }, 0) / Ns.length : 3;
    var Lf = Math.max(0, L - ign);
    var QlDq = 10 * (Nsm / 3 + 1) * U * Lf;
    var it = Math.max(1, Math.min(M.max, roundPar(L)));
    var nA = M.m[Math.max(1, Math.min(M.max, Math.floor(L)))], nB = M.m[Math.max(1, Math.min(M.max, Math.ceil(L)))];
    var NtipAv = Math.min(nA == null ? 0 : nA, nB == null ? 0 : nB);
    var cp = camadaEm(f, L), Tp = TIPOS[cp ? cp.tipo : 'areia'];
    var QpAv = Tp.K * NtipAv / F1 * Ap;
    var sNp = 0; [it - 1, it, it + 1].forEach(function (k) { if (M.m[k] != null) sNp += M.m[k]; });
    var Np = sNp / 3;   // ⚠ ÷3 sempre, como no cálculo do projeto (a favor na borda do furo)
    var QpDq = Tp.C * Np * Ap;
    var QuAv = QlAv + QpAv, QuDq = QlDq + QpDq;
    return {
      L: L, camadaPonta: cp ? cp.descricao : '', tipoPonta: cp ? cp.tipo : '', criticoPonta: !!(cp && TIPOS[cp.tipo] && TIPOS[cp.tipo].organica),
      aoki: { Ql: QlAv, Qp: QpAv, Qu: QuAv, Ntip: NtipAv },
      decourt: { Ql: QlDq, Qp: QpDq, Qu: QuDq, Nsm: Nsm, Np: Np },
      Qadm: Math.min(QuAv, QuDq) / FS, Qtracao: 0.70 * Math.min(QlAv, QlDq) / FS
    };
  }

  /* curva capacidade × profundidade (a régua do simulador) */
  function curva(f, est, par, opts) {
    opts = opts || {};
    var L0 = opts.de || 1.0, L1 = opts.ate != null ? opts.ate : Math.max(L0, (f.fim || 10) - 1.0), passo = opts.passo || 0.10;
    var out = [], n = Math.round((L1 - L0) / passo);
    for (var k = 0; k <= n; k++) {
      var L = Math.round((L0 + k * passo) * 100) / 100;
      var c = capacidade(f, L, est, par);
      out.push({ L: L, aoki: c.aoki.Qu, decourt: c.decourt.Qu, Qadm: c.Qadm, ponta: c.tipoPonta, critico: c.criticoPonta });
    }
    return out;
  }

  /* profundidade mínima para a carga + o alerta de camada crítica logo abaixo.
     Devolve null em L quando a carga não é atingida no trecho ensaiado. */
  function profundidadeNecessaria(f, cargaKN, est, par, opts) {
    var cv = curva(f, est, par, opts), L = null;
    for (var i = 0; i < cv.length; i++) if (cv[i].Qadm >= cargaKN && !cv[i].critico) { L = cv[i].L; break; }
    var crits = classificar(f).filter(function (c) { return c.critico && c.de > 0.5; });
    var primeiroCritico = crits.length ? crits[0].de : null;
    var aviso = '';
    if (L == null) aviso = 'A carga não é atingida no trecho ensaiado com esta estaca.';
    else if (primeiroCritico != null && L > primeiroCritico) aviso = 'A profundidade passa do topo do solo crítico (' + primeiroCritico.toFixed(2).replace('.', ',') + ' m).';
    // melhor comprimento ANTES do solo crítico (o que a fundação curta explora)
    var antes = cv.filter(function (p) { return primeiroCritico == null || p.L <= primeiroCritico - 0.5; });
    var melhor = antes.reduce(function (m, p) { return (!m || p.Qadm > m.Qadm) ? p : m; }, null);
    return { L: L, carga: cargaKN, primeiroCritico: primeiroCritico, melhorAntesDoCritico: melhor, aviso: aviso, curva: cv };
  }

  /* ---------------------------------------------------------------- *
   * volumes 3D das unidades geotécnicas (coordenadas do IFC, z para cima)
   *   area: [[x,y] ×4] retângulo em volta da obra; furos com posicao {x,y,zBoca}
   *   devolve [{unidade, nome, cor, critico, v:[8 × [x,y,z]] }] — hexaedros
   *   (topo e base interpolados nos 4 cantos pelo inverso da distância²)
   * ---------------------------------------------------------------- */
  function limitesUnidade(f, uid) {
    var cs = (f.camadas || []).filter(function (c) { return c.unidade === uid; });
    if (!cs.length) return null;
    return { de: Math.min.apply(null, cs.map(function (c) { return c.de; })), ate: Math.max.apply(null, cs.map(function (c) { return c.ate; })) };
  }
  function idw(pts, x, y, chave) {
    var sw = 0, s = 0;
    for (var i = 0; i < pts.length; i++) {
      var d2 = (pts[i].x - x) * (pts[i].x - x) + (pts[i].y - y) * (pts[i].y - y);
      if (d2 < 1e-9) return pts[i][chave];
      var w = 1 / d2; sw += w; s += w * pts[i][chave];
    }
    return sw ? s / sw : null;
  }
  function volumes3D(s, opts) {
    opts = opts || {};
    var area = opts.area || s.area;
    var fs = (s.furos || []).filter(function (f) { return f.posicao && f.posicao.x != null && f.posicao.y != null && f.posicao.zBoca != null; });
    if (!area || area.length < 4 || !fs.length) return [];
    var us = (s.unidades || []).length ? s.unidades : [];
    var out = [];
    us.forEach(function (u) {
      var pts = [];
      fs.forEach(function (f) { var l = limitesUnidade(f, u.id); if (l) pts.push({ x: f.posicao.x, y: f.posicao.y, zt: f.posicao.zBoca - l.de, zb: f.posicao.zBoca - l.ate }); });
      if (!pts.length) return;
      var topo = area.map(function (p) { return [p[0], p[1], idw(pts, p[0], p[1], 'zt')]; });
      var base = area.map(function (p) { return [p[0], p[1], idw(pts, p[0], p[1], 'zb')]; });
      var T = TIPOS[u.tipo] || TIPOS.areia;
      out.push({ unidade: u.id, nome: u.nome || T.nome, cor: u.cor || T.cor, critico: !!u.critico, v: base.concat(topo),
                 zTopoMedio: topo.reduce(function (a, p) { return a + p[2]; }, 0) / 4, zBaseMedia: base.reduce(function (a, p) { return a + p[2]; }, 0) / 4 });
    });
    return out;
  }

  /* posição esquemática quando o boletim não amarra o furo ao modelo:
     furos alinhados ao longo do maior lado da área, separados pela distância
     dada (ou 1/3 do lado) — SEMPRE marcada como esquemática */
  function posicaoEsquematica(area, n, sep) {
    var a = area[0], b = area[1], c = area[2];
    var cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2;
    var ux = b[0] - a[0], uy = b[1] - a[1], L = Math.sqrt(ux * ux + uy * uy) || 1; ux /= L; uy /= L;
    var passo = sep || L / 3, out = [];
    for (var i = 0; i < n; i++) { var t = (i - (n - 1) / 2) * passo; out.push({ x: cx + ux * t, y: cy + uy * t, fonte: 'esquemática' }); }
    return out;
  }

  var Sondagem = {
    TIPOS: TIPOS, designacao: designacao, normalizar: normalizar, furo: furo, camadaEm: camadaEm, classificar: classificar,
    capacidade: capacidade, curva: curva, profundidadeNecessaria: profundidadeNecessaria, volumes3D: volumes3D,
    posicaoEsquematica: posicaoEsquematica, _roundPar: roundPar
  };
  global.Sondagem = Sondagem;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sondagem;
})(typeof window !== 'undefined' ? window : this);

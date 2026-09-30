/* =====================================================================
 * sondagemui.js — o HTML/SVG da Sondagem 3D (sem estado, sem DOM vivo)
 *
 *   boletim(furo, camadasClassificadas)  → o boletim SPT como no relatório
 *   perfilSVG(furo, classes, opts)       → o perfil com N-SPT, NA, estaca e
 *                                          o cursor de profundidade
 *   curvaSVG(curva, opts)                → capacidade × profundidade
 *   barraSVG(furo, classes, sim, opts)   → a "régua" do simulador: até onde
 *                                          a estaca tem de ir para a carga
 *
 * A tela (gestao.js) só pluga os eventos; tudo aqui é testável em Node.
 * ===================================================================== */
(function (global) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function br(v, n) { if (v == null || !isFinite(v)) return '—'; return (+v).toFixed(n == null ? 2 : n).replace('.', ','); }
  function dataBR(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : esc(s || ''); }

  function camadaDe(classes, z) {
    for (var i = 0; i < classes.length; i++) if (classes[i].de <= z && z < classes[i].ate) return i;
    return classes.length - 1;
  }

  /* ---------------- boletim ---------------- */
  function boletim(f, classes, meta) {
    meta = meta || {};
    var linhas = [], porCamada = {};
    (f.spt || []).forEach(function (s) { var k = camadaDe(classes, s.prof); (porCamada[k] = porCamada[k] || []).push(s); });
    var usadas = {};
    (f.spt || []).forEach(function (s) {
      var k = camadaDe(classes, s.prof), c = classes[k] || {};
      var g = s.golpes || [], p = s.pen || [];
      var tres = g.length >= 3;
      var gtxt = tres ? g.map(function (x, i) { return x + '/' + (p[i] || 15); }).join(' · ') : (g[0] != null ? g[0] + '/' + (p[0] || '') : '—');
      var ini = tres ? (g[0] + g[1]) : (g[0] != null ? g[0] : null);
      var larg = Math.min(100, (s.N || 0) / 50 * 100);
      var celCamada = '';
      if (!usadas[k]) {
        usadas[k] = true;
        celCamada = '<td class="sd-cam' + (c.critico ? ' sd-crit' : '') + '" rowspan="' + porCamada[k].length + '" style="border-left:4px solid ' + esc(c.cor) + '">' +
          '<b>' + br(c.de) + ' – ' + br(c.ate) + ' m</b><br>' + esc(c.descricao) + (c.critico ? '<br><span class="sd-tag">' + (typeof Icones !== 'undefined' && Icones.get ? Icones.get('alerta', 12) + ' ' : '') + 'SOLO CRÍTICO</span>' : '') + '</td>';
      }
      linhas.push('<tr class="' + (c.critico ? 'sd-lcrit' : '') + '" data-prof="' + s.prof + '">' +
        '<td class="sd-num">' + br(s.prof) + '</td><td>' + esc(gtxt) + '</td><td class="sd-num">' + (ini == null ? '—' : ini) + '</td>' +
        '<td class="sd-num"><b>' + (s.N == null ? '—' : s.N) + '</b>' + (s.bruto && !tres ? '<br><small>' + esc(s.bruto) + '</small>' : '') + '</td>' +
        '<td class="sd-bar"><span style="width:' + larg + '%;background:' + (s.N === 0 ? '#b3261e' : '#37474f') + '"></span></td>' + celCamada +
        '<td>' + esc(c.designacao || '') + '</td></tr>');
    });
    var eq = f.equipe || {};
    var cab = '<div class="sd-cab">' +
      '<div class="sd-tit">SONDAGEM DE SIMPLES RECONHECIMENTO DO SOLO COM SPT — ' + esc(meta.norma || 'NBR 6484:2020') + '</div>' +
      '<div class="sd-grid">' +
      '<div><span>Furo</span><b>' + esc(f.id) + '</b></div>' +
      '<div><span>Empresa / trabalho</span>' + esc(meta.empresa || '') + (meta.trabalho ? ' · ' + esc(meta.trabalho) : '') + '</div>' +
      '<div><span>Início / término</span>' + dataBR(f.inicio) + ' – ' + dataBR(f.termino) + '</div>' +
      '<div><span>Nível d\'água</span><b style="color:#1565c0">' + br(f.na) + ' m</b>' + (f.naData ? ' (' + dataBR(f.naData) + ')' : '') + '</div>' +
      '<div><span>Profundidade final</span>' + br(f.fim) + ' m</div>' +
      '<div><span>Coordenadas</span>' + esc(f.coordenadas || '—') + (f.datum ? ' · ' + esc(f.datum) : '') + '</div>' +
      '</div>' +
      '<div class="sd-eq">' + esc((meta.equipamento && meta.equipamento.amostrador) || '') + (meta.equipamento && meta.equipamento.martelo ? ' · ' + esc(meta.equipamento.martelo) : '') + '</div></div>';
    var rod = '<div class="sd-rod">' + (f.criterioParada ? esc(f.criterioParada) + '. ' : '') +
      (eq.sondador ? 'Sondador: ' + esc(eq.sondador) + '. ' : '') + (eq.responsavel ? 'Responsável: ' + esc(eq.responsavel) + '. ' : '') +
      'N = golpes dos 30 cm finais; "1/72" = um golpe e o amostrador afundou 72 cm (N = 0, solo que não resiste).</div>';
    return cab + '<table class="sd-tab"><thead><tr><th>Prof. (m)</th><th>Golpes / penetração (cm)</th><th>30 cm iniciais</th><th>N (30 cm finais)</th>' +
      '<th>N-SPT</th><th>Camada</th><th>Designação (NBR 6484)</th></tr></thead><tbody>' + linhas.join('') + '</tbody></table>' + rod;
  }

  /* ---------------- perfil vertical ---------------- */
  function perfilSVG(f, classes, o) {
    o = o || {};
    var W = o.largura || 220, H = o.altura || 520, zmax = o.zmax || Math.ceil(f.fim || 20);
    var x0 = 34, lw = 46, k = (H - 30) / zmax, y = function (z) { return 16 + z * k; };
    var s = ['<svg class="sd-perfil" viewBox="0 0 ' + W + ' ' + H + '" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Arial" font-size="9">'];
    s.push('<defs><pattern id="sdcrit" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#b3261e" stroke-width="1.4"/></pattern></defs>');
    classes.forEach(function (c) {
      if (c.de >= zmax) return;
      var a = y(c.de), b = y(Math.min(c.ate, zmax));
      s.push('<rect x="' + x0 + '" y="' + a + '" width="' + lw + '" height="' + Math.max(0.5, b - a) + '" fill="' + c.cor + '" stroke="#555" stroke-width="0.4"/>');
      if (c.critico) s.push('<rect x="' + x0 + '" y="' + a + '" width="' + lw + '" height="' + Math.max(0.5, b - a) + '" fill="url(#sdcrit)" stroke="#b3261e" stroke-width="1"/>');
    });
    for (var z = 0; z <= zmax; z += (zmax > 12 ? 2 : 1)) s.push('<line x1="' + (x0 - 4) + '" y1="' + y(z) + '" x2="' + x0 + '" y2="' + y(z) + '" stroke="#333"/><text x="' + (x0 - 6) + '" y="' + (y(z) + 3) + '" text-anchor="end">' + z + '</text>');
    var xs = x0 + lw + 6;
    (f.spt || []).forEach(function (sp) {
      if (sp.prof > zmax) return;
      var w = Math.max(1, (sp.N || 0) / 60 * (W - xs - 22));
      s.push('<rect x="' + xs + '" y="' + (y(sp.prof) - 4) + '" width="' + w + '" height="8" fill="' + (sp.N === 0 ? '#b3261e' : '#455a64') + '"/>');
      s.push('<text x="' + (xs + w + 3) + '" y="' + (y(sp.prof) + 3) + '" fill="' + (sp.N === 0 ? '#b3261e' : '#222') + '">' + (sp.N == null ? '' : sp.N) + '</text>');
    });
    if (f.na != null && f.na < zmax) s.push('<line x1="' + (x0 - 6) + '" y1="' + y(f.na) + '" x2="' + (W - 4) + '" y2="' + y(f.na) + '" stroke="#1565c0" stroke-dasharray="4 2" stroke-width="1.2"/><text x="' + (W - 4) + '" y="' + (y(f.na) - 3) + '" text-anchor="end" fill="#1565c0">NA ' + br(f.na) + '</text>');
    if (o.estaca && o.estaca.L) {
      var Lx = x0 + lw / 2, Ly = y(o.estaca.L);
      s.push('<rect x="' + (Lx - 5) + '" y="' + y(0) + '" width="10" height="' + Math.max(1, Ly - 6 - y(0)) + '" fill="' + (o.estaca.cor || '#6d7a3f') + '" stroke="#222" stroke-width="0.6"/>' +
             '<polygon points="' + (Lx - 5) + ',' + (Ly - 6) + ' ' + (Lx + 5) + ',' + (Ly - 6) + ' ' + Lx + ',' + Ly + '" fill="' + (o.estaca.cor || '#6d7a3f') + '" stroke="#222" stroke-width="0.6"/>');
    }
    s.push('<g class="sd-cursor" data-k="' + k + '" data-top="16" style="display:' + (o.cursor != null ? 'inline' : 'none') + '" transform="translate(0,' + (o.cursor != null ? y(o.cursor) - 16 : 0) + ')">' +
           '<line x1="0" y1="16" x2="' + W + '" y2="16" stroke="#e65100" stroke-width="1.6"/><text class="sd-cursor-txt" x="2" y="13" fill="#e65100" font-weight="bold">' + (o.cursor != null ? br(o.cursor) + ' m' : '') + '</text></g>');
    s.push('<text x="' + x0 + '" y="10" font-weight="bold">' + esc(f.id) + '</text></svg>');
    return s.join('');
  }

  /* ---------------- curva capacidade × profundidade ---------------- */
  function curvaSVG(cv, o) {
    o = o || {};
    var W = o.largura || 420, H = o.altura || 360, Lmax = o.Lmax || 8, Qmax = o.Qmax || Math.max(100, Math.ceil(((o.carga || 0) * 2.2) / 25) * 25);
    var mx = 38, my = 18, pw = W - mx - 12, ph = H - my - 40;
    var X = function (q) { return mx + Math.min(q, Qmax) / Qmax * pw; }, Y = function (L) { return my + L / Lmax * ph; };
    var s = ['<svg class="sd-curva" viewBox="0 0 ' + W + ' ' + H + '" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Arial" font-size="9">'];
    if (o.janela) s.push('<rect x="' + mx + '" y="' + Y(o.janela[0]) + '" width="' + pw + '" height="' + (Y(o.janela[1]) - Y(o.janela[0])) + '" fill="#fde3df"/>');
    if (o.critico != null && o.critico < Lmax) s.push('<rect x="' + mx + '" y="' + Y(o.critico) + '" width="' + pw + '" height="' + (my + ph - Y(o.critico)) + '" fill="#b3261e" fill-opacity="0.08"/><text x="' + (mx + 4) + '" y="' + (Y(o.critico) + 11) + '" fill="#b3261e">solo crítico a partir de ' + br(o.critico) + ' m</text>');
    for (var q = 0; q <= Qmax; q += Qmax / 5) s.push('<line x1="' + X(q) + '" y1="' + my + '" x2="' + X(q) + '" y2="' + (my + ph) + '" stroke="#ddd"/><text x="' + X(q) + '" y="' + (my - 5) + '" text-anchor="middle">' + Math.round(q) + '</text>');
    for (var L = 0; L <= Lmax; L += 1) s.push('<line x1="' + mx + '" y1="' + Y(L) + '" x2="' + (mx + pw) + '" y2="' + Y(L) + '" stroke="#eee"/><text x="' + (mx - 4) + '" y="' + (Y(L) + 3) + '" text-anchor="end">' + L + '</text>');
    var pts = cv.filter(function (p) { return p.L <= Lmax; });
    function linha(ch, cor, w, da) { s.push('<polyline fill="none" stroke="' + cor + '" stroke-width="' + w + '"' + (da ? ' stroke-dasharray="' + da + '"' : '') + ' points="' + pts.map(function (p) { return X(p[ch]).toFixed(1) + ',' + Y(p.L).toFixed(1); }).join(' ') + '"/>'); }
    linha('aoki', '#1f4e79', 1.2); linha('decourt', '#6aa0d8', 1.2, '4 2'); linha('Qadm', '#1b5e20', 2.4);
    if (o.carga) s.push('<line x1="' + X(o.carga) + '" y1="' + my + '" x2="' + X(o.carga) + '" y2="' + (my + ph) + '" stroke="#e65100" stroke-width="1.6" stroke-dasharray="5 2"/><text x="' + (X(o.carga) + 3) + '" y="' + (my + 10) + '" fill="#e65100" font-weight="bold">' + br(o.carga, 1) + ' kN</text>');
    if (o.Lnec != null) s.push('<circle cx="' + X(o.carga) + '" cy="' + Y(o.Lnec) + '" r="4.5" fill="#e65100"/><text x="' + (X(o.carga) + 7) + '" y="' + (Y(o.Lnec) + 3) + '" fill="#e65100" font-weight="bold">L ≥ ' + br(o.Lnec) + ' m</text>');
    if (o.Lprojeto != null) s.push('<line x1="' + mx + '" y1="' + Y(o.Lprojeto) + '" x2="' + (mx + pw) + '" y2="' + Y(o.Lprojeto) + '" stroke="#6d4c1f" stroke-width="1.2" stroke-dasharray="2 2"/><text x="' + (mx + pw - 2) + '" y="' + (Y(o.Lprojeto) - 3) + '" text-anchor="end" fill="#6d4c1f">projeto: ' + br(o.Lprojeto) + ' m</text>');
    s.push('<rect x="' + mx + '" y="' + my + '" width="' + pw + '" height="' + ph + '" fill="none" stroke="#555"/>');
    s.push('<text x="' + (mx + pw / 2) + '" y="' + (H - 18) + '" text-anchor="middle">carga (kN)</text><text x="10" y="' + (my + ph / 2) + '" transform="rotate(-90 10 ' + (my + ph / 2) + ')" text-anchor="middle">comprimento cravado (m)</text>');
    s.push('<g font-size="8.5"><line x1="' + mx + '" y1="' + (H - 6) + '" x2="' + (mx + 14) + '" y2="' + (H - 6) + '" stroke="#1f4e79" stroke-width="1.2"/><text x="' + (mx + 17) + '" y="' + (H - 3) + '">Aoki-Velloso</text>' +
           '<line x1="' + (mx + 90) + '" y1="' + (H - 6) + '" x2="' + (mx + 104) + '" y2="' + (H - 6) + '" stroke="#6aa0d8" stroke-width="1.2" stroke-dasharray="4 2"/><text x="' + (mx + 107) + '" y="' + (H - 3) + '">Décourt-Quaresma</text>' +
           '<line x1="' + (mx + 205) + '" y1="' + (H - 6) + '" x2="' + (mx + 219) + '" y2="' + (H - 6) + '" stroke="#1b5e20" stroke-width="2.4"/><text x="' + (mx + 222) + '" y="' + (H - 3) + '">Qadm (menor ÷ FS)</text></g></svg>');
    return s.join('');
  }

  /* ---------------- a régua do simulador ---------------- */
  function barraSVG(f, classes, sim, o) {
    o = o || {};
    var W = o.largura || 170, H = o.altura || 420, Lmax = o.Lmax || 8, k = (H - 40) / Lmax, y = function (z) { return 20 + z * k; };
    var s = ['<svg class="sd-barra" viewBox="0 0 ' + W + ' ' + H + '" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Arial" font-size="9">'];
    classes.forEach(function (c) {
      if (c.de >= Lmax) return;
      s.push('<rect x="20" y="' + y(c.de) + '" width="70" height="' + Math.max(0.5, y(Math.min(c.ate, Lmax)) - y(c.de)) + '" fill="' + c.cor + '"' + (c.critico ? ' stroke="#b3261e" stroke-width="1.5"' : '') + '/>');
      if (c.critico) s.push('<text x="55" y="' + (y(Math.max(c.de, 0)) + 13) + '" text-anchor="middle" fill="#fff" font-weight="bold">CRÍTICO</text>');
    });
    // termômetro: a capacidade admissível a cada profundidade, cheia até a carga
    var cv = (sim && sim.curva) || [], carga = sim ? sim.carga : 0;
    cv.forEach(function (p, i) {
      if (p.L > Lmax || i === 0) return;
      var a = y(cv[i - 1].L), b = y(p.L), fr = Math.min(1, p.Qadm / Math.max(carga, 1));
      s.push('<rect x="100" y="' + a + '" width="' + (fr * 50).toFixed(1) + '" height="' + (b - a + 0.3).toFixed(1) + '" fill="' + (fr >= 1 ? '#2e7d32' : '#f9a825') + '"/>');
    });
    s.push('<rect x="100" y="20" width="50" height="' + (H - 40) + '" fill="none" stroke="#555"/>');
    s.push('<text x="125" y="14" text-anchor="middle">Qadm ÷ carga</text>');
    if (sim && sim.L != null && sim.L <= Lmax) {
      var Ly = y(sim.L);
      s.push('<rect x="50" y="' + y(0) + '" width="10" height="' + Math.max(1, Ly - 7 - y(0)) + '" fill="#6d7a3f" stroke="#222" stroke-width="0.6"/><polygon points="50,' + (Ly - 7) + ' 60,' + (Ly - 7) + ' 55,' + Ly + '" fill="#6d7a3f" stroke="#222" stroke-width="0.6"/>');
      s.push('<line x1="16" y1="' + Ly + '" x2="' + (W - 4) + '" y2="' + Ly + '" stroke="#e65100" stroke-width="1.6"/><text x="' + (W - 4) + '" y="' + (Ly - 3) + '" text-anchor="end" fill="#e65100" font-weight="bold">' + br(sim.L) + ' m</text>');
    }
    for (var z = 0; z <= Lmax; z++) s.push('<text x="16" y="' + (y(z) + 3) + '" text-anchor="end">' + z + '</text>');
    s.push('<text x="55" y="12" text-anchor="middle" font-weight="bold">' + esc(f.id) + '</text></svg>');
    return s.join('');
  }

  var CSS = '.sd-cab{border:1px solid #cfd8dc;border-radius:6px;padding:8px 10px;margin-bottom:8px;background:#f7f9fa}' +
    '.sd-tit{font-weight:700;font-size:12px;letter-spacing:.2px;margin-bottom:6px}' +
    '.sd-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 12px;font-size:12px}.sd-grid span{display:block;color:#607d8b;font-size:10.5px}' +
    '.sd-eq{font-size:11px;color:#546e7a;margin-top:4px}' +
    '.sd-tab{width:100%;border-collapse:collapse;font-size:11.5px}.sd-tab th{background:#eceff1;text-align:left;padding:4px;border:1px solid #cfd8dc;position:sticky;top:0}' +
    '.sd-tab td{border:1px solid #e0e0e0;padding:3px 4px;vertical-align:top}.sd-num{text-align:center}.sd-bar{width:90px}.sd-bar span{display:block;height:9px;border-radius:2px}' +
    '.sd-cam{min-width:170px;background:#fff}.sd-crit{background:#fdecea!important}.sd-lcrit td{background:#fff6f5}.sd-tag{color:#b3261e;font-weight:700;font-size:10.5px}' +
    '.sd-tab tr.sd-ativa td{outline:2px solid #e65100;outline-offset:-2px}.sd-rod{font-size:11px;color:#546e7a;margin-top:6px}';

  var SondagemUI = { boletim: boletim, perfilSVG: perfilSVG, curvaSVG: curvaSVG, barraSVG: barraSVG, CSS: CSS };
  global.SondagemUI = SondagemUI;
  if (typeof module !== 'undefined' && module.exports) module.exports = SondagemUI;
})(typeof window !== 'undefined' ? window : this);

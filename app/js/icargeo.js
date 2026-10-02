/* =====================================================================
 * icargeo.js — GEOGRAFIA DO PLANO DE IÇAMENTO (ESPEC-ICAMENTO-CENARIO.md §II.7). Motor PURO (ES5, testável em Node).
 *  - local ↔ geográfico: deslocamento em metros (leste, norte) pelos RAIOS DO ELIPSOIDE (GRS80 = SIRGAS 2000) no ponto;
 *  - UTM (Krüger, série em n até n⁴ — milímetro dentro do fuso), ida e volta, com o fuso e o EPSG do SIRGAS 2000/WGS 84;
 *  - Web Mercator (tile e resolução);
 *  - SOL: posição e nascer/pôr pelo algoritmo da NOAA (Meeus), para a luz da cena e a janela do clima;
 *  - georreferência do MODELO: { lat, lon (do ponto x0,y0 do motor), x0, y0, norte (graus: o norte verdadeiro girado a partir do
 *    +Y do modelo, anti-horário) } — vinda do IFC (IfcSite + TrueNorth, ou IfcMapConversion + IfcProjectedCRS) ou marcada;
 *  - leitura de coordenada colada: link do Google Maps (@lat,lon / !3d…!4d… / q=lat,lon), "lat, lon", graus-minutos-segundos.
 * ⚠ As coordenadas do motor são as do IFC (o bim.js abre sem deslocar para a origem): a conversão do IfcMapConversion vale direto.
 * ===================================================================== */
(function (global) {
  "use strict";
  var A = 6378137, F = 1 / 298.257222101, E2 = F * (2 - F);   // GRS80 (SIRGAS 2000); WGS 84 difere em décimos de mm aqui
  var RAD = Math.PI / 180;

  /* ---------- local (metros) ↔ geográfico ---------- */
  function raios(lat) { var s = Math.sin(lat * RAD), w = Math.sqrt(1 - E2 * s * s); return { M: A * (1 - E2) / (w * w * w), N: A / w }; }
  function deslocar(lat, lon, leste, norte) { var r = raios(lat); return { lat: lat + norte / r.M / RAD, lon: lon + leste / (r.N * Math.cos(lat * RAD)) / RAD }; }
  function enu(lat0, lon0, lat, lon) { var r = raios(lat0); return { e: (lon - lon0) * RAD * r.N * Math.cos(lat0 * RAD), n: (lat - lat0) * RAD * r.M }; }

  /* ---------- UTM (Krüger) ---------- */
  var n_ = F / (2 - F), n2 = n_ * n_, n3 = n2 * n_, n4 = n3 * n_;
  var AA = A / (1 + n_) * (1 + n2 / 4 + n4 / 64);
  var ALF = [n_ / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180, 13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440, 61 * n3 / 240 - 103 * n4 / 140, 49561 * n4 / 161280];
  var BET = [n_ / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360, n2 / 48 + n3 / 15 - 437 * n4 / 1440, 17 * n3 / 480 - 37 * n4 / 840, 4397 * n4 / 161280];
  var DEL = [2 * n_ - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45, 7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45, 56 * n3 / 15 - 136 * n4 / 35, 4279 * n4 / 630];
  var K0 = 0.9996;
  function atanh(x) { return 0.5 * Math.log((1 + x) / (1 - x)); }
  function sinh(x) { return (Math.exp(x) - Math.exp(-x)) / 2; }
  function cosh(x) { return (Math.exp(x) + Math.exp(-x)) / 2; }
  function fusoDe(lon) { return Math.floor((lon + 180) / 6) + 1; }
  function utm(lat, lon, fuso) {
    fuso = fuso || fusoDe(lon);
    var l0 = ((fuso - 1) * 6 - 180 + 3) * RAD, phi = lat * RAD, dl = lon * RAD - l0, c = 2 * Math.sqrt(n_) / (1 + n_);
    var t = sinh(atanh(Math.sin(phi)) - c * atanh(c * Math.sin(phi))), xi = Math.atan(t / Math.cos(dl)), eta = atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
    var e = eta, nn = xi;
    for (var j = 1; j <= 4; j++) { e += ALF[j - 1] * Math.cos(2 * j * xi) * sinh(2 * j * eta); nn += ALF[j - 1] * Math.sin(2 * j * xi) * cosh(2 * j * eta); }
    return { fuso: fuso, sul: lat < 0, e: 500000 + K0 * AA * e, n: (lat < 0 ? 10000000 : 0) + K0 * AA * nn };
  }
  function deUtm(e, n, fuso, sul) {
    var xi = (n - (sul ? 10000000 : 0)) / (K0 * AA), eta = (e - 500000) / (K0 * AA), xp = xi, ep = eta;
    for (var j = 1; j <= 4; j++) { xp -= BET[j - 1] * Math.sin(2 * j * xi) * cosh(2 * j * eta); ep -= BET[j - 1] * Math.cos(2 * j * xi) * sinh(2 * j * eta); }
    var chi = Math.asin(Math.sin(xp) / cosh(ep)), phi = chi;
    for (var k = 1; k <= 4; k++) phi += DEL[k - 1] * Math.sin(2 * k * chi);
    var l0 = ((fuso - 1) * 6 - 180 + 3) * RAD;
    return { lat: phi / RAD, lon: (l0 + Math.atan(sinh(ep) / Math.cos(xp))) / RAD };
  }
  /* EPSG → fuso UTM: SIRGAS 2000 (31965–31985: 11N…25S do Brasil), WGS 84 (326NN norte, 327NN sul) */
  function fusoDoEpsg(cod) {
    var c = +String(cod || "").replace(/[^0-9]/g, "");
    if (c >= 31978 && c <= 31985) return { fuso: c - 31960, sul: true, nome: "SIRGAS 2000 / UTM " + (c - 31960) + "S" };
    if (c >= 31972 && c <= 31977) return { fuso: c - 31955, sul: false, nome: "SIRGAS 2000 / UTM " + (c - 31955) + "N" };
    if (c >= 32601 && c <= 32660) return { fuso: c - 32600, sul: false, nome: "WGS 84 / UTM " + (c - 32600) + "N" };
    if (c >= 32701 && c <= 32760) return { fuso: c - 32700, sul: true, nome: "WGS 84 / UTM " + (c - 32700) + "S" };
    return null;
  }

  /* ---------- Web Mercator ---------- */
  function tileDe(lat, lon, z) { var nz = Math.pow(2, z), la = lat * RAD; return { x: (lon + 180) / 360 * nz, y: (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * nz }; }
  function resolucao(lat, z) { return 156543.03392 * Math.cos(lat * RAD) / Math.pow(2, z); }

  /* ---------- SOL (NOAA / Meeus) ---------- */
  function diaJuliano(ms) { return ms / 86400000 + 2440587.5; }
  function solNoInstante(jd) {
    var T = (jd - 2451545) / 36525;
    var L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360, M = 357.52911 + T * (35999.05029 - 0.0001537 * T), e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    var C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289;
    var lamb = L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * T) * RAD);
    var eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60, eps = eps0 + 0.00256 * Math.cos((125.04 - 1934.136 * T) * RAD);
    var dec = Math.asin(Math.sin(eps * RAD) * Math.sin(lamb * RAD)) / RAD;
    var y = Math.tan(eps / 2 * RAD); y *= y;
    var eqt = 4 / RAD * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
    return { dec: dec, eqt: eqt };
  }
  /* posição do sol: elevação (graus acima do horizonte) e azimute (graus a partir do NORTE, horário) */
  function sol(lat, lon, ms) {
    var s = solNoInstante(diaJuliano(ms)), d = new Date(ms), minUtc = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
    var tst = minUtc + s.eqt + 4 * lon, ha = tst / 4 - 180;
    var cz = Math.sin(lat * RAD) * Math.sin(s.dec * RAD) + Math.cos(lat * RAD) * Math.cos(s.dec * RAD) * Math.cos(ha * RAD);
    cz = Math.max(-1, Math.min(1, cz));
    var zen = Math.acos(cz) / RAD, az;
    var den = Math.cos(lat * RAD) * Math.sin(zen * RAD);
    if (Math.abs(den) < 1e-9) az = 0;
    else { var ca = (Math.sin(lat * RAD) * Math.cos(zen * RAD) - Math.sin(s.dec * RAD)) / den; ca = Math.max(-1, Math.min(1, ca)); az = Math.acos(ca) / RAD; az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360; }
    return { elevacao: 90 - zen, azimute: az };
  }
  /* nascer e pôr (instantes em ms UTC) do dia civil `dia` (AAAA-MM-DD) — duas passadas (a segunda com o sol do próprio instante) */
  function nascerPor(lat, lon, dia) {
    var b = Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10));
    function evento(sinal) {
      var t = b + 12 * 3600000 - lon / 15 * 3600000;
      for (var k = 0; k < 2; k++) {
        var s = solNoInstante(diaJuliano(t));
        var cH = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(s.dec * RAD)) - Math.tan(lat * RAD) * Math.tan(s.dec * RAD);
        if (cH > 1 || cH < -1) return null;   // sol da meia-noite / noite polar
        var H = Math.acos(cH) / RAD, minUtc = 720 - 4 * (lon + sinal * H) - s.eqt;
        t = b + minUtc * 60000;
      }
      return t;
    }
    var noon = b + (720 - 4 * lon - solNoInstante(diaJuliano(b + 12 * 3600000)).eqt) * 60000;
    return { nascer: evento(1), por: evento(-1), meioDia: noon };
  }

  /* ---------- coordenada colada ---------- */
  function lerCoordenada(txt) {
    var s = String(txt || "").trim(), m;
    if (!s) return null;
    if ((m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(s))) return valida(+m[1], +m[2], "link do Google Maps");
    if ((m = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(s))) return valida(+m[1], +m[2], "link do Google Maps");
    if ((m = /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i.exec(s))) return valida(+m[1], +m[2], "link de mapa");
    var dms = /(\d+)\s*[°º]\s*(\d+)\s*['′]\s*(\d+(?:[.,]\d+)?)\s*(?:"|″|'')?\s*([NSns])\W+(\d+)\s*[°º]\s*(\d+)\s*['′]\s*(\d+(?:[.,]\d+)?)\s*(?:"|″|'')?\s*([EWOLewol])/.exec(s);
    if (dms) {
      var la = (+dms[1] + +dms[2] / 60 + +dms[3].replace(",", ".") / 3600) * (/[Ss]/.test(dms[4]) ? -1 : 1);
      var lo = (+dms[5] + +dms[6] / 60 + +dms[7].replace(",", ".") / 3600) * (/[WwOo]/.test(dms[8]) ? -1 : 1);
      return valida(la, lo, "graus, minutos e segundos");
    }
    if ((m = /^(-?\d+(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d+(?:[.,]\d+)?)$/.exec(s.replace(/\s+/g, " ")))) return valida(+m[1].replace(",", "."), +m[2].replace(",", "."), "coordenadas");
    return null;
  }
  function valida(lat, lon, fonte) { return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat: lat, lon: lon, fonte: fonte } : null; }
  /* IfcCompoundPlaneAngleMeasure: [graus, minutos, segundos, milionésimos de segundo] — todos com o mesmo sinal */
  function anguloIfc(v) {
    if (!v || !v.length) return null;
    var g = +v[0] || 0, mi = +v[1] || 0, se = +v[2] || 0, mic = +v[3] || 0;
    return g + mi / 60 + (se + mic / 1e6) / 3600;
  }

  /* ---------- georreferência do modelo ---------- */
  function norteDeTrueNorth(x, y) { return Math.atan2(-(+x || 0), +y || 1) / RAD; }   // TrueNorth (0,1) → 0°; (-0,5; 0,866) → 30°
  /* lat/lon → motor (x, y) */
  function paraMotor(geo, lat, lon) {
    var d = enu(geo.lat, geo.lon, lat, lon), t = (+geo.norte || 0) * RAD, c = Math.cos(t), s = Math.sin(t);
    /* o eixo norte (0,1) vira (−sen θ, cos θ); o leste (1,0) vira (cos θ, sen θ) */
    return { x: (+geo.x0 || 0) + d.e * c - d.n * s, y: (+geo.y0 || 0) + d.e * s + d.n * c };
  }
  function deMotor(geo, x, y) {
    var t = (+geo.norte || 0) * RAD, c = Math.cos(t), s = Math.sin(t), dx = x - (+geo.x0 || 0), dy = y - (+geo.y0 || 0);
    var e = dx * c + dy * s, n = -dx * s + dy * c, r = deslocar(geo.lat, geo.lon, e, n);
    return r;
  }
  /* IfcMapConversion (Eastings, Northings, XAxisAbscissa, XAxisOrdinate, Scale) + EPSG → georreferência do motor */
  function geoDoMapConversion(mc, epsg) {
    var fz = fusoDoEpsg(epsg); if (!fz || !mc) return null;
    var sc = +mc.Scale || 1, ax = +mc.XAxisAbscissa, ay = +mc.XAxisOrdinate;
    if (!isFinite(ax) || !isFinite(ay) || (ax === 0 && ay === 0)) { ax = 1; ay = 0; }
    var nrm = Math.sqrt(ax * ax + ay * ay), ca = ax / nrm, sa = ay / nrm;
    function ll(x, y) { return deUtm(+mc.Eastings + sc * (x * ca - y * sa), +mc.Northings + sc * (x * sa + y * ca), fz.fuso, fz.sul); }
    var o = ll(0, 0), p = ll(0, 100), d = enu(o.lat, o.lon, p.lat, p.lon);
    /* o +Y do modelo aponta para o azimute de d; o norte, girado dele: θ = atan2(e, n) do +Y */
    return { lat: o.lat, lon: o.lon, x0: 0, y0: 0, norte: Math.atan2(d.e, d.n) / RAD, fonte: "IfcMapConversion (" + fz.nome + ")", escala: sc };
  }

  var IcarGeo = { deslocar: deslocar, enu: enu, raios: raios, utm: utm, deUtm: deUtm, fusoDe: fusoDe, fusoDoEpsg: fusoDoEpsg, tileDe: tileDe, resolucao: resolucao,
    sol: sol, nascerPor: nascerPor, lerCoordenada: lerCoordenada, anguloIfc: anguloIfc, norteDeTrueNorth: norteDeTrueNorth, paraMotor: paraMotor, deMotor: deMotor,
    geoDoMapConversion: geoDoMapConversion };
  global.IcarGeo = IcarGeo;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarGeo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * hidpranchasedit.js — AJUSTES MANUAIS POR VISTA das pranchas do hidrossanitário (motor PURO, ES5, sem DOM, Node-testável).
 * Pedido do Rogério (17/11/2026, etapa 3): "as pranchas viram folhas SALVAS, reabríveis e EDITÁVEIS: em cada vista o usuário arrasta o
 * crop e a profundidade, gira o isométrico, esconde/mostra por categoria e por elemento, move/redimensiona a viewport e move rótulos e
 * balões. REGERAR NÃO APAGA O AJUSTE MANUAL; há 'voltar ao automático' por vista."
 *
 * O MODELO. O ajuste mora FORA da folha gerada: um mapa  vistas[chave] = ajuste  por obra (localStorage
 * `orcapro:hid:pranchas:ajustes:<obra>`). A chave é ESTÁVEL (não é o número da folha, que muda quando entra ambiente):
 *   - vista de modelo (isométrico/perspectiva):  "persp|<ambiente>|<grupo>|<pavimento>"  ou  "iso|<título do isométrico>"
 *   - bloco da folha (planta, corte, reservatório…): "<tipo>|<título da folha>#<ordem do bloco>"
 * O gerador (js/hidpranchas.js) LÊ o ajuste a cada geração: o que muda a FOTO do modelo (câmera, crop, o que está escondido no 3D) entra
 * no desenho da vista; o que é só do desenho da folha (viewport, rótulos, camadas) é aplicado por aplicarSvg() em cima do SVG pronto.
 * Por isso regerar refaz o automático e reaplica o manual por cima — nunca o contrário.
 *
 * O AJUSTE de uma vista (todas as partes são opcionais; sem a parte = automático):
 *   cam     { vista: "SE"|"SO"|"NE"|"NO"|null, az: graus|null, travada: bool }  câmera do isométrico (az = órbita livre, em graus)
 *   crop    { x0, x1, z0, z1, y0, y1 }  caixa de corte em metros do modelo (planta e profundidade/altura)
 *   oculto  { cats: [id BimFoco], discs: [id], camadas: [data-cam], uids: ["mid:expressID"] }  o que sai da vista
 *   vp      { dx, dy, k }  a viewport na folha: deslocamento em mm de papel e fator de tamanho (k=1 = como saiu)
 *   rot     { "<texto>#<n>": { dx, dy } }  rótulos e balões movidos (mm de papel)
 *
 *   HidPranchasEdit.vazio() · normalizar(a) · ler(obra) · gravar(obra, aj) · ajusteDe(aj, chave)
 *   .definir(aj, chave, parte, valor)  → novo aj (valor null/neutro remove a parte)
 *   .voltarAutomatico(aj, chave, partes?)  → novo aj
 *   .aplicarSvg(svg, aj)  → svg com viewport, camadas ocultas e rótulos movidos  ·  .blocosDoSvg(svg) → vistas editáveis da folha
 *   .rasterMuda(ajV) → o ajuste exige refazer a FOTO do modelo?  ·  .azDeCamera(pos, alvo) → graus
 * Teste: node tools/test-hid-pranchas-editaveis.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* hid:geometria-inicio — ajuste de DESENHO e de VISTA (mm de papel, graus, metros do modelo): nenhum valor de norma aqui */
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function arred(v, c) { var f = Math.pow(10, c == null ? 3 : c); return Math.round(v * f) / f; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function slug(s) { return txt(s).normalize ? txt(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : txt(s).toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

  var CHAVE = "orcapro:hid:pranchas:ajustes:";
  var VISTAS = ["SE", "SO", "NE", "NO"];
  var PARTES = ["cam", "crop", "oculto", "vp", "rot"];
  var K = { kMin: 0.3, kMax: 3, dMax: 2000, azMax: 360 };   /* limites do que a tela aceita (viewport 30 %–300 %, deslocamento até 2 m de papel) */

  function vazio() { return { versao: 1, vistas: {} }; }

  /* ------------------------------------------------------------ normalização (nada de lixo no armazenamento) */
  function lista(v) { var o = [], vistos = {}; arr(v).forEach(function (x) { x = txt(x); if (x && !vistos[x]) { vistos[x] = 1; o.push(x); } }); return o; }
  function normCam(c) {
    if (!c || typeof c !== "object") return null;
    var o = {}, v = txt(c.vista).toUpperCase();
    if (VISTAS.indexOf(v) >= 0) o.vista = v;
    if (fin(+c.az) && c.az !== null && c.az !== "") { var a = ((+c.az % K.azMax) + K.azMax) % K.azMax; o.az = arred(a, 1); delete o.vista; }
    if (c.travada) o.travada = true;
    return o.vista != null || o.az != null ? o : null;
  }
  function normCrop(c) {
    if (!c || typeof c !== "object") return null;
    var o = {}, ok = false;
    ["x0", "x1", "z0", "z1", "y0", "y1"].forEach(function (k) { if (c[k] !== null && c[k] !== "" && c[k] !== undefined && fin(+c[k])) { o[k] = arred(+c[k], 3); ok = true; } });
    if (!ok) return null;
    if (o.x0 != null && o.x1 != null && !(o.x1 > o.x0)) return null;
    if (o.z0 != null && o.z1 != null && !(o.z1 > o.z0)) return null;
    if (o.y0 != null && o.y1 != null && !(o.y1 > o.y0)) return null;
    return o;
  }
  function normOculto(c) {
    if (!c || typeof c !== "object") return null;
    var o = { cats: lista(c.cats), discs: lista(c.discs), camadas: lista(c.camadas), uids: lista(c.uids) };
    return o.cats.length || o.discs.length || o.camadas.length || o.uids.length ? o : null;
  }
  function normVp(c) {
    if (!c || typeof c !== "object") return null;
    var dx = Math.max(-K.dMax, Math.min(K.dMax, num(c.dx, 0))), dy = Math.max(-K.dMax, Math.min(K.dMax, num(c.dy, 0))), k = Math.max(K.kMin, Math.min(K.kMax, num(c.k, 1)));
    dx = arred(dx, 2); dy = arred(dy, 2); k = arred(k, 3);
    return dx === 0 && dy === 0 && k === 1 ? null : { dx: dx, dy: dy, k: k };
  }
  function normRot(c) {
    if (!c || typeof c !== "object") return null;
    var o = {}, n = 0;
    Object.keys(c).forEach(function (k) {
      var d = c[k]; if (!d || typeof d !== "object") return;
      var dx = arred(Math.max(-K.dMax, Math.min(K.dMax, num(d.dx, 0))), 2), dy = arred(Math.max(-K.dMax, Math.min(K.dMax, num(d.dy, 0))), 2);
      if (dx === 0 && dy === 0) return; o[k] = { dx: dx, dy: dy }; n++;
    });
    return n ? o : null;
  }
  var NORM = { cam: normCam, crop: normCrop, oculto: normOculto, vp: normVp, rot: normRot };
  function normVista(v) {
    var o = {}, n = 0; if (!v || typeof v !== "object") return null;
    PARTES.forEach(function (p) { var x = NORM[p](v[p]); if (x) { o[p] = x; n++; } });
    return n ? o : null;
  }
  function normalizar(a) {
    var o = vazio(); if (!a || typeof a !== "object") return o;
    Object.keys(a.vistas || {}).forEach(function (k) { var v = normVista(a.vistas[k]); if (v && txt(k)) o.vistas[k] = v; });
    return o;
  }

  /* ------------------------------------------------------------ armazenamento por obra */
  function chaveObra(obraKey) { return CHAVE + (txt(obraKey) || "geral"); }
  function ler(obraKey, ls) {
    var L = ls || (global.localStorage || null), v = null;
    try { v = L ? JSON.parse(L.getItem(chaveObra(obraKey)) || "null") : null; } catch (e) { v = null; }
    return normalizar(v);
  }
  function gravar(obraKey, aj, ls) {
    var L = ls || (global.localStorage || null);
    try { if (L) { var n = normalizar(aj); if (Object.keys(n.vistas).length) L.setItem(chaveObra(obraKey), JSON.stringify(n)); else L.removeItem(chaveObra(obraKey)); } return !!L; } catch (e) { return false; }
  }

  /* ------------------------------------------------------------ edição (funcional: devolve um ajuste novo) */
  function ajusteDe(aj, chave) { var v = aj && aj.vistas ? aj.vistas[txt(chave)] : null; return v ? clone(v) : null; }
  function definir(aj, chave, parte, valor) {
    var o = normalizar(aj), c = txt(chave);
    if (!c || PARTES.indexOf(parte) < 0) return o;
    var v = o.vistas[c] ? clone(o.vistas[c]) : {};
    var x = valor == null ? null : NORM[parte](valor);
    if (x) v[parte] = x; else delete v[parte];
    var n = normVista(v); if (n) o.vistas[c] = n; else delete o.vistas[c];
    return o;
  }
  function voltarAutomatico(aj, chave, partes) {
    var o = normalizar(aj), c = txt(chave); if (!o.vistas[c]) return o;
    var ps = arr(partes).length ? partes : PARTES, v = clone(o.vistas[c]);
    ps.forEach(function (p) { delete v[p]; });
    var n = normVista(v); if (n) o.vistas[c] = n; else delete o.vistas[c];
    return o;
  }
  /* o ajuste exige refazer a FOTO do modelo (câmera, crop e o que se esconde no 3D)? Viewport, rótulos e camadas do desenho NÃO exigem */
  function rasterMuda(v) {
    if (!v) return false;
    var o = v.oculto || {};
    return !!(v.cam || v.crop || arr(o.cats).length || arr(o.discs).length || arr(o.uids).length);
  }
  /* a câmera do 3D (posição − alvo no plano XZ) → o azimute da projeção da prancha: SE = 0°, SO = 90°, NO = 180°, NE = 270° (o quadrante do projetor) */
  function azDeCamera(pos, alvo) {
    var dx = num(pos && pos[0], 0) - num(alvo && alvo[0], 0), dz = num(pos && pos[2], 0) - num(alvo && alvo[2], 0);
    if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
    var a = Math.atan2(dx - dz, dx + dz) * 180 / Math.PI;
    return arred(((a % 360) + 360) % 360, 1);
  }
  var QUAD = { SE: 0, SO: 90, NO: 180, NE: 270 };
  /* o ângulo (graus) da câmera do ajuste, ou null se for automático */
  function anguloDe(cam) { if (!cam) return null; if (fin(cam.az)) return cam.az; return QUAD[cam.vista] != null ? QUAD[cam.vista] : null; }
  /* o nome do quadrante mais próximo de um ângulo (o rótulo da tela) */
  function quadranteDe(az) { var m = null, d = 1e9; Object.keys(QUAD).forEach(function (q) { var x = Math.abs(((az - QUAD[q] + 540) % 360) - 180); if (x < d) { d = x; m = q; } }); return m; }

  /* ------------------------------------------------------------ SVG: os blocos (vistas) da folha */
  /* os grupos <g data-bloco=…> do SVG, com a posição do texto: [{ ini, fim, abertura, attrs, chave, tipo, x, y, w, h, escala }] (fim = depois do </g>) */
  function atributos(tag) {
    var o = {}, re = /([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/g, m;
    while ((m = re.exec(tag))) o[m[1]] = m[2];
    return o;
  }
  function acharBlocos(svg) {
    var s = txt(svg), re = /<g\b[^>]*>|<\/g>/g, m, pilha = [], out = [];
    while ((m = re.exec(s))) {
      if (m[0].charAt(1) === "/") { var t = pilha.pop(); if (t && t.bloco) { t.fim = m.index + m[0].length; t.corpoFim = m.index; out.push(t); } continue; }
      if (/\/>$/.test(m[0])) continue;
      var at = atributos(m[0]), isB = at["data-bloco"] != null;
      pilha.push({ bloco: isB, ini: m.index, abertura: m[0], corpoIni: m.index + m[0].length, attrs: at });
    }
    out.sort(function (a, b) { return a.ini - b.ini; });
    out.forEach(function (b) {
      b.tipo = txt(b.attrs["data-bloco"]).replace(/-\d+$/, ""); b.x = num(b.attrs["data-x"], 0); b.y = num(b.attrs["data-y"], 0); b.w = num(b.attrs["data-w"], 0); b.h = num(b.attrs["data-h"], 0);
      b.escala = txt(b.attrs["data-escala"]); b.chave = txt(b.attrs["data-chave"]) || txt(b.attrs["data-bloco"]);
    });
    return out;
  }
  function textosDe(corpo) {
    var out = [], re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g, m, vistos = {};
    while ((m = re.exec(corpo))) {
      var conteudo = txt(m[2]).replace(/<[^>]*>/g, ""), n = vistos[conteudo] = (vistos[conteudo] || 0) + 1, at = atributos("<text " + m[1] + ">");
      out.push({ ini: m.index, fim: m.index + m[0].length, texto: conteudo, id: conteudo + "#" + n, x: num(at.x, 0), y: num(at.y, 0), balao: at["data-detalhe"] != null, tam: num(at["font-size"], 2) });
    }
    return out;
  }
  function camadasDe(corpo) {
    var o = {}, re = /\sdata-cam="([^"]*)"/g, m; while ((m = re.exec(corpo))) o[m[1]] = (o[m[1]] || 0) + 1;
    return Object.keys(o).sort().map(function (k) { return { id: k, n: o[k] }; });
  }
  /* as vistas EDITÁVEIS da folha (o que a tela lista e permite ajustar): chave, tipo, retângulo em mm de papel, escala, camadas e rótulos */
  function blocosDoSvg(svg) {
    var s = txt(svg);
    return acharBlocos(s).map(function (b) {
      var corpo = s.slice(b.corpoIni, b.corpoFim), tx = textosDe(corpo);
      return { chave: b.chave, tipo: b.tipo, x: b.x, y: b.y, w: b.w, h: b.h, escala: b.escala, camadas: camadasDe(corpo), rotulos: tx.filter(function (t) { return t.texto.length > 0; }).map(function (t) { return { id: t.id, texto: t.texto, x: t.x, y: t.y, balao: t.balao }; }) };
    });
  }

  /* ------------------------------------------------------------ SVG: aplica o ajuste de desenho por cima do SVG pronto */
  function moverRotulos(corpo, rot) {
    var tx = textosDe(corpo), partes = [], pos = 0, mexidos = 0;
    tx.forEach(function (t) {
      var r = rot[t.id]; if (!r) return;
      var ini = t.ini;
      /* o balão (círculo desenhado logo antes do número) anda junto */
      if (t.balao) { var ant = corpo.slice(pos, ini), mc = /<circle\b[^>]*\/>\s*$/.exec(ant); if (mc) ini = pos + mc.index; }
      if (ini < pos) return;
      partes.push(corpo.slice(pos, ini));
      partes.push('<line x1="' + arred(t.x, 3) + '" y1="' + arred(t.y, 3) + '" x2="' + arred(t.x + r.dx, 3) + '" y2="' + arred(t.y + r.dy, 3) + '" stroke="#7a7a7a" stroke-width="0.12" stroke-dasharray="0.8 0.8" data-aj="rot-guia"/>');
      partes.push('<g transform="translate(' + arred(r.dx, 3) + " " + arred(r.dy, 3) + ')" data-aj="rot">' + corpo.slice(ini, t.fim) + "</g>");
      pos = t.fim; mexidos++;
    });
    partes.push(corpo.slice(pos));
    return { corpo: partes.join(""), n: mexidos };
  }
  function ocultarCamadas(corpo, cams) {
    if (!cams.length) return corpo;
    var set = {}; cams.forEach(function (c) { set[c] = 1; });
    return corpo.replace(/(<[A-Za-z]+\b[^>]*?)(\sdata-cam="([^"]*)")/g, function (m0, a, b, c) { return set[c] ? a + b + ' display="none"' : m0; });
  }
  function aplicarSvg(svg, aj) {
    var s = txt(svg), A = normalizar(aj), blocos = acharBlocos(s), mudou = false;
    if (!Object.keys(A.vistas).length || !blocos.length) return s;
    for (var i = blocos.length - 1; i >= 0; i--) {
      var b = blocos[i], v = A.vistas[b.chave]; if (!v) continue;
      var corpo = s.slice(b.corpoIni, b.corpoFim), abertura = b.abertura;
      if (v.rot) corpo = moverRotulos(corpo, v.rot).corpo;
      if (v.oculto && v.oculto.camadas.length) corpo = ocultarCamadas(corpo, v.oculto.camadas);
      if (v.vp) {
        var k = v.vp.k, tx = b.x + v.vp.dx - k * b.x, ty = b.y + v.vp.dy - k * b.y;
        abertura = abertura.replace(/>$/, ' transform="translate(' + arred(tx, 3) + " " + arred(ty, 3) + ") scale(" + arred(k, 4) + ')" data-aj="vp">');
        abertura = abertura.replace(/data-x="[^"]*"/, 'data-x="' + arred(b.x + v.vp.dx, 3) + '"').replace(/data-y="[^"]*"/, 'data-y="' + arred(b.y + v.vp.dy, 3) + '"')
          .replace(/data-w="[^"]*"/, 'data-w="' + arred(b.w * k, 3) + '"').replace(/data-h="[^"]*"/, 'data-h="' + arred(b.h * k, 3) + '"');
        /* a escala do desenho muda com o tamanho: 1:50 numa viewport a 200 % vira 1:25 (o texto e o atributo do CAD acompanham) */
        var me = /^1:(\d+)$/.exec(b.escala);
        if (me && k !== 1) {
          var novaE = Math.max(1, Math.round(+me[1] / k));
          abertura = abertura.replace(/data-escala="[^"]*"/, 'data-escala="1:' + novaE + '"');
          corpo = corpo.replace(/(<text\b[^>]*>)((?:ESC|ESCALA)\s+)1:(\d+)(<\/text>)/g, function (m0, a, p, n0, f) { return a + p + "1:" + Math.max(1, Math.round(+n0 / k)) + f; });
        }
      }
      if (abertura.indexOf('data-aj="') < 0) abertura = abertura.replace(/>$/, ' data-aj="1">');
      s = s.slice(0, b.ini) + abertura + corpo + s.slice(b.corpoFim); mudou = true;
    }
    return mudou ? s : s;
  }

  /* a chave de uma vista de modelo (a mesma no gerador e na tela): ambiente × grupo × pavimento */
  function chaveVista(amb, grupo, pav, pref) {
    var a = txt(amb && (amb.ambienteBim || amb.nomeBase || amb.nome || amb.id)), g = txt(grupo && (grupo.id != null ? grupo.id : grupo)), p = txt(pav && (pav.nome != null ? pav.nome : pav));
    return [pref || "persp", slug(a) || "-", slug(g) || "-", slug(p) || "-"].join("|");
  }
  function chaveIso(titulo) { return "iso|" + (slug(titulo) || "-"); }
  function chaveBloco(tipo, tituloFolha, ordem) { return [slug(tipo) || "bloco", slug(tituloFolha) || "-"].join("|") + "#" + (ordem || 1); }

  /* hid:geometria-fim */
  var HidPranchasEdit = { VERSAO: 1, K: K, PARTES: PARTES, VISTAS: VISTAS, vazio: vazio, normalizar: normalizar, ler: ler, gravar: gravar, chaveObra: chaveObra, ajusteDe: ajusteDe, definir: definir, voltarAutomatico: voltarAutomatico,
    rasterMuda: rasterMuda, azDeCamera: azDeCamera, anguloDe: anguloDe, quadranteDe: quadranteDe, aplicarSvg: aplicarSvg, blocosDoSvg: blocosDoSvg, chaveVista: chaveVista, chaveIso: chaveIso, chaveBloco: chaveBloco, slug: slug,
    _int: { acharBlocos: acharBlocos, textosDe: textosDe, camadasDe: camadasDe, moverRotulos: moverRotulos, ocultarCamadas: ocultarCamadas, atributos: atributos } };
  global.HidPranchasEdit = HidPranchasEdit;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPranchasEdit;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

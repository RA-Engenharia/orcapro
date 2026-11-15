/* =====================================================================
 * concvista.js — VISTA DE ESTRUTURA do "Sugerir estrutura" (fase S2, 14/11/2026). Motor PURO, ES5, sem DOM.
 * docs/concreto/FLUXO-SUGERIR-ESTRUTURA.md, etapa 7. Molde: js/arqpranchas.js (folha, carimbo RA, conferência de sobreposição) e
 * js/hidpranchas.js (arquitetura em meio-tom sob a disciplina em cor).
 *
 *   ConcVista.gerar({ estado, res }, opcoes) → { ok, folhas: [{ id, tipo, nivel, numero, titulo, formato, escala, svg }], avisos, verificacao, ... }
 *   ConcVista.assinatura(estado)             → texto curto que MUDA quando muda a estrutura ou a parede (a vista só é refeita se mudou)
 *
 *   estado = o estado do BimEdit (caixas); res = ConcLanc.gerar(...) OU ConcLanc.dadosDoModelo(estado, ...) (eixos, níveis, locação, vigas).
 *
 * O QUE SAI (tudo vem do MODELO; nada é desenhado de cabeça):
 *   · uma PLANTA por nível: baldrame · cada pavimento (locação dos pilares) · respaldo/cobertura (fôrma: pilares, vigas, lajes) — a estrutura EM COR
 *     (concreto cortado azul, em vista verde, no padrão RA v2.0) sobre a ARQUITETURA EM MEIO-TOM (paredes INTEIRAS, sem os vãos), grade de eixos com
 *     bolhas (A, B…; 1, 2…), cotas PARCIAIS e ACUMULADAS entre eixos (cm), nome e seção de cada peça (P1 14/26, V101 15/40, L101 h12);
 *   · CORTES automáticos pelos eixos principais (longitudinal AA e transversal BB) + um por balanço e um por desnível de parede;
 *   · TABELAS desenhadas: locação dos pilares (pilar, eixos, X, Y, seção, base, topo), níveis e vigas (início, fim, topo, fundo, seção).
 * A conferência de sobreposição (texto × texto, texto × linha, texto fora da moldura) roda em toda folha e vai em `verificacao`.
 * ⚠ Nada aqui é cálculo: a folha leva a faixa "PRÉ-DIMENSIONAMENTO — A CALCULAR" (a seção vem do pré-lançamento).
 * Teste: node tools/test-conc-s2.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* sem o módulo */ } }
    return null;
  }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function DS() { return dep("ArqDesenho", "./arqdesenho.js"); }
  function ES() { return dep("ArqEstilo", "./arqestilo.js"); }
  function PDF() { return dep("SvgPdf", "./svgpdf.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function dois(k) { return ("0" + k).slice(-2); }
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  function br(v, c) { if (v == null || !isFinite(v)) return "-"; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function cmTxt(m) { return String(Math.round(m * 100)); }
  function nivelTxt(z) { return (z > 0.0005 ? "+" : (z < -0.0005 ? "-" : "±")) + br(Math.abs(z), 2) + "m"; }

  /* mm de papel e escalas do desenho (geometria de desenho, não norma) */
  var K = {
    escalas: [50, 75, 100, 125, 150, 200], formatos: ["A3", "A2", "A1", "A0"],
    margEsq: 40, margDir: 14, margTopo: 46, margBase: 12, hTitulo: 15,     /* esquerda: bolhas + cotas; topo: bolhas + cotas */
    extEixo: 7, offParcial: 18, offAcum: 26, passoCorte: 14,
    cor: { corte: "#1f5fa8", vista: "#1e7a3c", oculta: "#9a6a00", eixo: "#c00000", pilar: "#1f5fa8", parede: "#d4d4d4", paredeLn: "#9a9a9a", pilar12: "#d97706" }
  };
  var AVISO = "PRÉ-DIMENSIONAMENTO — A CALCULAR";

  /* ------------------------------------------------------------ geometria das peças */
  function ret(c) {
    var th = num(c.rotY, 0), ux = [Math.cos(th), -Math.sin(th)], uz = [Math.sin(th), Math.cos(th)], a = num(c.comprimento, 0) / 2, b = num(c.espessura, 0) / 2, o = [num(c.cx, 0), num(c.cz, 0)];
    function p(sa, sb) { return [o[0] + ux[0] * a * sa + uz[0] * b * sb, o[1] + ux[1] * a * sa + uz[1] * b * sb]; }
    return { o: o, ux: ux, uz: uz, a: a, b: b, c: [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)] };
  }
  function ehEstrutura(c) { return !!(c && c.conc && (c.conc.papel === "pilar" || c.conc.papel === "viga" || c.conc.papel === "laje")); }
  function baseDe(c) { return num(c.cy, 0) - num(c.altura, 0) / 2; }
  function topoDe(c) { return num(c.cy, 0) + num(c.altura, 0) / 2; }
  function poliLaje(c) { return arr(c.contorno).map(function (p) { return [num(p.x, 0), num(p.z, 0)]; }); }
  function bboxDe(pts) { var x0 = 1e18, z0 = 1e18, x1 = -1e18, z1 = -1e18; pts.forEach(function (p) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }); return { x0: x0, z0: z0, x1: x1, z1: z1 }; }
  function juntaBbox(a, b) { if (!a) return b; if (!b) return a; return { x0: Math.min(a.x0, b.x0), z0: Math.min(a.z0, b.z0), x1: Math.max(a.x1, b.x1), z1: Math.max(a.z1, b.z1) }; }
  function marcaNum(m) { var q = /(\d+)/.exec(txt(m)); return q ? +q[1] : 0; }

  /* a assinatura do modelo: só o que a vista desenha (estrutura e paredes) — mudou, a vista é refeita */
  function assinatura(estado) {
    var s = [];
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || (c.tipo !== "parede" && !ehEstrutura(c))) return;
      s.push([c.tipo, c.id, c.marca || "", n(num(c.cx, 0)), n(num(c.cz, 0)), n(num(c.cy, 0)), n(num(c.comprimento, 0)), n(num(c.espessura, 0)), n(num(c.altura, 0)), n(num(c.rotY, 0)), n(num(c.topoViga, 0)),
        arr(c.contorno).map(function (p) { return n(p.x) + "," + n(p.z); }).join(";")].join("|"));
    });
    s.sort();
    var h = 5381, t = s.join("\n");
    for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
    return s.length + ":" + (h >>> 0).toString(36);
  }

  /* ------------------------------------------------------------ o recorte do modelo por nível */
  function paredesDoPav(estado, pv) {
    return arr(estado.caixas).filter(function (c) {
      if (!c || c.tipo !== "parede" || c.conc) return false;
      var b = baseDe(c);
      return b >= pv.base - 0.3 && b < pv.topo - 0.3;
    });
  }
  function niveisDaVista(res) {
    /* baldrame · (piso k, respaldo/cobertura k) por pavimento — a ordem que o S1 entrega em res.niveis */
    var lista = [], N = arr(res.niveis), pavs = arr(res.pavimentos);
    N.forEach(function (nv, i) {
      var pavIdx = i === 0 ? 0 : Math.floor((i - 1) / 2);
      if (!pavs[pavIdx]) return;
      lista.push({ tipo: nv.tipo, nome: nv.nome, cota: nv.cota, pav: pavIdx, nivelId: nv.nivelId });
    });
    return lista;
  }
  function recorteNivel(estado, res, nv) {
    var pv = res.pavimentos[nv.pav], C = arr(estado.caixas).filter(ehEstrutura), r = { pilares: [], vigas: [], lajes: [], paredes: paredesDoPav(estado, pv), pv: pv };
    C.forEach(function (c) {
      if (c.conc.pav !== nv.pav) return;
      if (c.conc.papel === "pilar") r.pilares.push(c);
      else if (c.conc.papel === "viga") { if (nv.tipo === "baldrame" ? !!c.conc.baldrame : !c.conc.baldrame) r.vigas.push(c); }
      else if (c.conc.papel === "laje" && nv.tipo !== "baldrame") r.lajes.push(c);
    });
    if (nv.tipo === "terreo" || nv.tipo === "piso") { r.vigas = []; r.lajes = []; }
    if (nv.tipo === "baldrame") { r.lajes = []; }
    return r;
  }
  function caixaDaVista(R, eixos) {
    var b = null;
    R.paredes.forEach(function (c) { b = juntaBbox(b, bboxDe(ret(c).c)); });
    R.pilares.concat(R.vigas).forEach(function (c) { b = juntaBbox(b, bboxDe(ret(c).c)); });
    R.lajes.forEach(function (c) { b = juntaBbox(b, bboxDe(poliLaje(c))); });
    arr(eixos.horizontais).forEach(function (e) { b = juntaBbox(b, { x0: e.de, z0: e.z, x1: e.ate, z1: e.z }); });
    arr(eixos.verticais).forEach(function (e) { b = juntaBbox(b, { x0: e.x, z0: e.de, x1: e.x, z1: e.ate }); });
    return b;
  }

  /* ------------------------------------------------------------ estilo (as camadas EST-* sobre o estilo arquitetura/RA) */
  function estilo(padrao) {
    var E = DS().estilo(padrao), S = ES();
    function cam(nome, mm, cor, dash) { E.camadas[nome] = { mm: mm, dash: dash || null, cor: cor }; }
    cam("EST-CORTE", 0.5, K.cor.corte); cam("EST-VISTA", 0.25, K.cor.vista); cam("EST-OCULTA", 0.18, K.cor.oculta, S.TRACEJADO);
    cam("EST-EIXO", 0.13, K.cor.eixo, DS().K.tracoEixo); cam("EST-NIVEL", 0.13, K.cor.eixo, DS().K.tracoEixo); cam("EST-CONTEXTO", 0.13, "#8a8a8a");
    cam("EST-TABELA", 0.25, "#000000");
    return E;
  }

  /* ------------------------------------------------------------ desenho da planta */
  function polo(pts) { return pts.map(function (p) { return n(p[0]) + "," + n(p[1]); }).join(" "); }
  function preenche(D, pts, fill, extra) { D.add('<polygon points="' + polo(pts) + '" fill="' + fill + '" stroke="none"' + (extra || "") + "/>"); }
  /* a parede INTEIRA em meio-tom: não é obstáculo de texto (D.add não registra segmento) */
  function paredeMeioTom(D, M, c) {
    var P = ret(c).c.map(function (p) { return M.P(p[0], p[1]); });
    D.add('<polygon points="' + polo(P) + '" fill="' + K.cor.parede + '" stroke="' + K.cor.paredeLn + '" stroke-width="0.13" data-cam="EST-CONTEXTO"/>');
  }
  function mapaDe(bx, ox, oy, k) { return DS().mapa([bx.x0, bx.z0, bx.x1, bx.z1], ox, oy, k); }

  function eixosPlanta(D, M, eixos, bx) {
    var ext = K.extEixo / M.k, rB = D.raioBalao("AA");
    arr(eixos.horizontais).forEach(function (e) {
      var a = M.P(Math.min(bx.x0, e.de) - ext, e.z), b = M.P(Math.max(bx.x1, e.ate) + ext, e.z);
      D.linha(a[0], a[1], b[0], b[1], "EST-EIXO");
      D.balao(a[0] - D.raioBalao(e.nome) - 0.4, a[1], e.nome, ' data-eixo="' + esc(e.nome) + '"');
    });
    arr(eixos.verticais).forEach(function (e) {
      var a = M.P(e.x, Math.min(bx.z0, e.de) - ext), b = M.P(e.x, Math.max(bx.z1, e.ate) + ext);
      D.linha(a[0], a[1], b[0], b[1], "EST-EIXO");
      D.balao(a[0], a[1] - D.raioBalao(e.nome) - 0.4, e.nome, ' data-eixo="' + esc(e.nome) + '"');
    });
    return rB;
  }
  function cotasEixos(D, M, eixos, bx) {
    var xs = arr(eixos.verticais).map(function (e) { return e.x; }).sort(function (a, b) { return a - b; }), zs = arr(eixos.horizontais).map(function (e) { return e.z; }).sort(function (a, b) { return a - b; });
    var yTop = M.P(bx.x0, bx.z0)[1] - K.extEixo - 8, xEsq = M.P(bx.x0, bx.z0)[0] - K.extEixo - 8;
    if (xs.length > 1) {
      var P = xs.map(function (x) { return [M.P(x, bx.z0)[0], yTop]; }), parc = [], acu = [""];
      for (var i = 0; i + 1 < xs.length; i++) parc.push(cmTxt(xs[i + 1] - xs[i]));
      for (var j = 1; j < xs.length; j++) acu.push(cmTxt(xs[j] - xs[0]));
      D.cadeia(P, 8, parc, { semExt: false });
      D.acumulada(P, 15.5, acu);
    }
    if (zs.length > 1) {
      var Q = zs.map(function (z) { return [xEsq, M.P(bx.x0, z)[1]]; }), parcZ = [], acuZ = [""];
      for (var a = 0; a + 1 < zs.length; a++) parcZ.push(cmTxt(zs[a + 1] - zs[a]));
      for (var b = 1; b < zs.length; b++) acuZ.push(cmTxt(zs[b] - zs[0]));
      D.cadeia(Q, -8, parcZ, { semExt: false });
      D.acumulada(Q, -15.5, acuZ);
    }
  }
  function rotuloPeca(D, M, ctr, s, h, area, pref) {
    var p = pref || M.P(ctr[0], ctr[1]);
    return D.textoLivre(p, s, h, area, { passo: 0.8, folga: 0.5 });
  }

  /* desenha a planta de UM nível dentro de (ox, oy); devolve o que precisa para a verificação */
  function desenharPlanta(D, E, c, nv, R, k, area) {
    var d = DS(), bx = c.caixaGlobal, ox = area.x + K.margEsq, oy = area.y + K.hTitulo + K.margTopo, M = mapaDe(bx, ox, oy, k), hT = E.T.nota || 2.5;
    var ob = area.obj;
    /* o título do desenho */
    d.titulo(D, area.x + 2, area.y + 1, nv.titulo, "ESC 1:" + c.escala, c.seq);
    /* arquitetura em meio-tom: paredes INTEIRAS */
    R.paredes.forEach(function (w) { paredeMeioTom(D, M, w); });
    /* a estrutura em cor */
    R.lajes.forEach(function (l) { var P = poliLaje(l).map(function (p) { return M.P(p[0], p[1]); }); D.poli(P, "EST-OCULTA", true); });
    R.vigas.forEach(function (v) {
      var P = ret(v).c.map(function (p) { return M.P(p[0], p[1]); });
      preenche(D, P, v.conc.balanco ? "#f2e8d0" : "#e6f2e9");
      D.poli(P, nv.tipo === "baldrame" ? "EST-CORTE" : "EST-VISTA", true);
    });
    R.pilares.forEach(function (p) {
      var P = ret(p).c.map(function (q) { return M.P(q[0], q[1]); }), cor = p.conc.opcao12 ? K.cor.pilar12 : K.cor.pilar;
      preenche(D, P, cor); D.poli(P, "EST-CORTE", true);
    });
    /* eixos, bolhas e cotas */
    eixosPlanta(D, M, c.eixos, bx);
    cotasEixos(D, M, c.eixos, bx);
    /* as marcas dos cortes (só na fôrma do respaldo/cobertura e na do baldrame) */
    if (nv.tipo !== "terreo" && nv.tipo !== "piso") (c.cortes || []).forEach(function (ct, i) {
      var perto = 0; (c.cortes || []).forEach(function (o, j) { if (j < i && o.tipo === ct.tipo && Math.abs(o.v - ct.v) < 0.3) perto++; });
      marcaCorte(D, M, ct, bx, perto * 9);
    });
    /* nomes: pilar P1 14/26 · viga V101 15/40 · laje L101 h12 */
    var areaT = [area.x + 1, area.y + K.hTitulo + 1, area.x + area.w - 1, area.y + area.h - 1], h = hT;
    R.pilares.forEach(function (p) { var q = ret(p).o, cm = M.P(q[0], q[1]); rotuloPeca(D, M, q, txt(p.marca) + " " + txt(p.conc.secao).replace(/\s*×\s*/, "/"), h, areaT, [cm[0] + 7, cm[1] - 5]); });
    R.vigas.forEach(function (v) { var q = ret(v).o, cm = M.P(q[0], q[1]); rotuloPeca(D, M, q, txt(v.marca) + " " + txt(v.conc.secao).replace(/\s*×\s*/, "/"), h, areaT, [cm[0], cm[1] - 3]); });
    R.lajes.forEach(function (l) { var q = bboxDe(poliLaje(l)), cm = M.P((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2); rotuloPeca(D, M, [0, 0], txt(l.marca) + " h" + num(l.conc && l.conc.h, Math.round(num(l.altura, 0) * 100)), h, areaT, cm); });
    return M;
  }
  /* a marca do corte: a linha traço-ponto sobre o eixo (só até a ponta do eixo), o traço grosso na ponta do lado que se olha e o círculo com a letra
     repetida (AA) ao lado do traço — NÃO prolonga a linha até o círculo: o corte pelo eixo principal cairia em cima da bolha do eixo (texto × linha) */
  function marcaCorte(D, M, ct, bx, desl) {
    var ext = K.extEixo * 0.55 / M.k, a, b, nx, ny; desl = desl || 0;
    if (ct.tipo === "h") { a = M.P(bx.x0 - ext, ct.v); b = M.P(bx.x1 + ext, ct.v); nx = 0; ny = -1; }
    else { a = M.P(ct.v, bx.z0 - ext); b = M.P(ct.v, bx.z1 + ext); nx = 1; ny = 0; }
    D.linha(a[0], a[1], b[0], b[1], "ARQ-CORTE");
    var r = 3.4, h = 2.6, L = ct.letra + ct.letra, ux = (b[0] - a[0]) / Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)), uy = (b[1] - a[1]) / Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
    [a, b].forEach(function (p, i) {
      var ox = (i === 0 ? -ux : ux) * desl, oy = (i === 0 ? -uy : uy) * desl;   /* cortes quase sobrepostos (balanço junto do eixo): o círculo do 2º sai mais para fora ao longo da linha */
      D.linha(p[0], p[1], p[0] + nx * 4, p[1] + ny * 4, "ARQ-PAREDE");
      var cx = p[0] + nx * (4 + r + 0.8) + ox, cy = p[1] + ny * (4 + r + 0.8) + oy;
      if (desl) { var dx = cx - p[0], dy = cy - p[1], dl = Math.sqrt(dx * dx + dy * dy); D.linha(p[0], p[1], cx - dx / dl * r, cy - dy / dl * r, "ARQ-CORTE"); }
      D.add('<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="#fff" stroke="none"/>');
      D.circ(cx, cy, r, "ARQ-SIMBOLO");
      D.texto(cx, cy + h * 0.36, L, h, { al: "C" });
    });
  }

  /* ------------------------------------------------------------ os cortes */
  /* intervalo [u0,u1] em que a linha (h: z = v, u = x · v: x = v, u = z) atravessa o polígono convexo/côncavo; devolve a lista de trechos */
  function trechosDaLinha(poli, tipo, v) {
    var us = [], i, a, b, A, B, t;
    for (i = 0; i < poli.length; i++) {
      a = poli[i]; b = poli[(i + 1) % poli.length];
      A = tipo === "h" ? a[1] : a[0]; B = tipo === "h" ? b[1] : b[0];
      if ((A - v) * (B - v) < 0 || (A === v && B !== v) || (B === v && A !== v && false)) {
        t = (v - A) / (B - A);
        us.push(tipo === "h" ? a[0] + (b[0] - a[0]) * t : a[1] + (b[1] - a[1]) * t);
      }
    }
    us.sort(function (p, q) { return p - q; });
    var out = [];
    for (i = 0; i + 1 < us.length; i += 2) if (us[i + 1] - us[i] > 0.004) out.push([us[i], us[i + 1]]);
    return out;
  }
  function elementosDoCorte(estado, ct) {
    var el = [];
    arr(estado.caixas).forEach(function (c) {
      if (!c) return;
      var poli = null, kind = null, y0, y1;
      if (c.tipo === "parede" && !c.conc) { poli = ret(c).c; kind = "parede"; y0 = baseDe(c); y1 = topoDe(c); }
      else if (ehEstrutura(c)) {
        if (c.conc.papel === "laje") { poli = poliLaje(c); kind = "laje"; y0 = baseDe(c); y1 = topoDe(c); }
        else if (c.conc.papel === "pilar") { poli = ret(c).c; kind = "pilar"; y0 = baseDe(c); y1 = topoDe(c); }
        else { poli = ret(c).c; kind = c.conc.balanco ? "balanco" : "viga"; y1 = num(c.topoViga, topoDe(c)); y0 = y1 - num(c.altura, 0); }
      }
      if (!poli || poli.length < 3) return;
      trechosDaLinha(poli, ct.tipo, ct.v).forEach(function (t) { el.push({ kind: kind, u0: t[0], u1: t[1], y0: y0, y1: y1, caixa: c }); });
    });
    return el;
  }
  function larguraCorte(c, ct) { return Math.max(1, (ct.ate - ct.de)) * c.k + 30; }
  function desenharCorte(D, E, c, ct, area, ox0, oy0) {
    var d = DS(), k = c.k, els = elementosDoCorte(c.estado, ct), u0 = ct.de, u1 = ct.ate, yMin = c.yMin, yMax = c.yMax, ox = ox0 + 18, oy = oy0 + K.hTitulo + 4;
    function X(u) { return ox + (u - u0) * k; }
    function Y(y) { return oy + (yMax - y) * k; }
    d.titulo(D, ox0, oy0 + 1, "CORTE " + ct.letra + ct.letra + (ct.motivo ? " - " + ct.motivo : ""), "ESC 1:" + c.escala, ct.letra + ct.letra);
    /* níveis: linha traço-ponto e o símbolo de cota à esquerda */
    var vistos = {};
    arr(c.niveisCorte).forEach(function (z) {
      var key = Math.round(z * 100); if (vistos[key]) return; vistos[key] = 1;
      D.linha(X(u0) - 3, Y(z), X(u1) + 3, Y(z), "EST-NIVEL");
      D.nivel(X(u0) - 4, Y(z), nivelTxt(z), -1);
    });
    /* ordem de desenho: parede (meio-tom) · laje · viga · pilar */
    var ordem = { parede: 0, laje: 1, viga: 2, balanco: 2, pilar: 3 };
    els.sort(function (a, b) { return ordem[a.kind] - ordem[b.kind]; });
    els.forEach(function (e) {
      var uA = Math.max(e.u0, u0), uB = Math.min(e.u1, u1); if (uB - uA < 0.004) return;
      var P = [[X(uA), Y(e.y1)], [X(uB), Y(e.y1)], [X(uB), Y(e.y0)], [X(uA), Y(e.y0)]];
      if (e.kind === "parede") { D.add('<polygon points="' + polo(P) + '" fill="' + K.cor.parede + '" stroke="' + K.cor.paredeLn + '" stroke-width="0.13" data-cam="EST-CONTEXTO"/>'); return; }
      if (e.kind === "pilar") { preenche(D, P, e.caixa.conc.opcao12 ? K.cor.pilar12 : K.cor.pilar); D.poli(P, "EST-CORTE", true); return; }
      if (e.kind === "laje") { preenche(D, P, "#dbe7f5"); D.poli(P, "EST-CORTE", true); return; }
      preenche(D, P, e.kind === "balanco" ? "#f2e8d0" : "#e6f2e9"); D.poli(P, "EST-CORTE", true);
    });
    /* nomes: o de cada peça aparece uma vez */
    var vis = {}, areaT = [ox0, oy0 + K.hTitulo, ox0 + c.larg, oy0 + c.alt], h = E.T.nota || 2.5;
    els.forEach(function (e) {
      if (e.kind === "parede") return;
      var id = e.caixa.id; if (vis[id]) return; vis[id] = 1;
      var uA = Math.max(e.u0, u0), uB = Math.min(e.u1, u1), ym = e.kind === "pilar" ? (e.y0 + e.y1) / 2 : e.y1 + 0.2, s = txt(e.caixa.marca) + (e.kind === "laje" ? " h" + num(e.caixa.conc.h, Math.round(num(e.caixa.altura, 0) * 100)) : " " + txt(e.caixa.conc.secao).replace(/\s*×\s*/, "/"));
      D.textoLivre([X((uA + uB) / 2), Y(ym) - (e.kind === "pilar" ? 0 : 2.4)], s, h, areaT, { passo: 0.8, folga: 0.5 });
    });
    return { larg: c.larg, alt: c.alt };
  }
  function definirCortes(estado, res, eixos, caixa) {
    var lista = [], letras = "ABCDEFGH", pavs = arr(res.pavimentos);
    var H = arr(eixos.horizontais).slice().sort(function (a, b) { return (b.ate - b.de) - (a.ate - a.de) || a.z - b.z; })[0];
    var V = arr(eixos.verticais).slice().sort(function (a, b) { return (b.ate - b.de) - (a.ate - a.de) || a.x - b.x; })[0];
    if (H) lista.push({ tipo: "h", v: H.z, de: caixa.x0 - 0.3, ate: caixa.x1 + 0.3, motivo: "longitudinal pelo eixo " + H.nome });
    if (V) lista.push({ tipo: "v", v: V.x, de: caixa.z0 - 0.3, ate: caixa.z1 + 0.3, motivo: "transversal pelo eixo " + V.nome });
    arr(estado.caixas).forEach(function (cx) {
      if (!cx || !cx.conc || cx.conc.papel !== "viga" || !cx.conc.balanco) return;
      var r = ret(cx), alongX = Math.abs(r.ux[0]) >= Math.abs(r.ux[1]);
      var tipo = alongX ? "h" : "v", v = alongX ? r.o[1] : r.o[0], de = (alongX ? bboxDe(r.c).x0 : bboxDe(r.c).z0) - 1.2, ate = (alongX ? bboxDe(r.c).x1 : bboxDe(r.c).z1) + 1.2;
      lista.push({ tipo: tipo, v: v, de: de, ate: ate, motivo: "balanço " + txt(cx.marca) });
    });
    /* desnível: parede de um pavimento com a base diferente da do pavimento */
    pavs.forEach(function (pv) {
      var diff = arr(estado.caixas).filter(function (w) { return w && w.tipo === "parede" && !w.conc && baseDe(w) >= pv.base - 0.3 && baseDe(w) < pv.topo - 0.3 && Math.abs(baseDe(w) - pv.base) > 0.05; })[0];
      if (!diff) return;
      var r = ret(diff), alongX = Math.abs(r.ux[0]) >= Math.abs(r.ux[1]), mid = r.o;
      lista.push({ tipo: alongX ? "v" : "h", v: alongX ? mid[0] : mid[1], de: (alongX ? caixa.z0 : caixa.x0) - 0.3, ate: (alongX ? caixa.z1 : caixa.x1) + 0.3, motivo: "desnível em " + diff.id });
    });
    var seen = {}, out = [];
    lista.forEach(function (c) { var key = c.tipo + Math.round(c.v * 100); if (seen[key]) return; seen[key] = 1; out.push(c); });
    out.forEach(function (c, i) { c.letra = letras.charAt(i) || String(i + 1); });
    return out;
  }

  /* ------------------------------------------------------------ colunas de notas */
  function blocosNotas(c) {
    return [
      { titulo: "LEGENDA", itens: ["PILAR (CONCRETO CORTADO) EM AZUL; EM LARANJA O PILAR DE 12 A 14 CM, FORA DA NBR 6118:2023", "VIGA EM VISTA EM VERDE; VIGA EM BALANÇO EM BEGE", "LAJE: CONTORNO TRACEJADO, NOME E ESPESSURA", "ARQUITETURA EM MEIO-TOM (PAREDES INTEIRAS)", "EIXOS E BOLHAS EM VERMELHO"] },
      { titulo: "NOTAS", itens: [AVISO + ": A POSIÇÃO E A SEÇÃO SAEM DE REGRAS DE CONCEPÇÃO COM FONTE; O ENGENHEIRO RESPONSÁVEL CALCULA, DIMENSIONA E ASSINA.", "COTAS EM CM; NÍVEIS EM M.", "AS COORDENADAS X, Y SÃO AS DO MODELO (ORIGEM NO PONTO ZERO DA OBRA)."] }
    ];
  }

  /* ------------------------------------------------------------ a folha */
  function montarFolha(c, def, D, pr, fl, geo, E) {
    var F = DS().novo(E, false), W = geo.papel.w, H = geo.papel.h, M = geo.moldura, A = AP();
    F.ret(M.x, M.y, M.w, M.h, "ARQ-MOLDURA");
    var coube = DS().colunaNotas(F, geo, blocosNotas(c));
    if (!coube) c.avisos.push(def.numero + ": as notas não cabem na coluna com a letra mínima do padrão: conferir.");
    A.carimbo(F, pr, fl, geo, c.empObj, c.op.logo || null, def.rotulo + "/" + dois(c.total));
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(H) + 'mm" viewBox="0 0 ' + n(W) + " " + n(H) + '" font-family="' + ES().FONTE.css + '" data-folha="' + def.id + '" data-numero="' + esc(def.numero) + '">' +
      "<title>" + esc(def.numero + " - " + def.titulo + " - " + c.rev) + "</title>" + '<rect x="0" y="0" width="' + n(W) + '" height="' + n(H) + '" fill="#fff"/>' +
      '<g data-corpo="1">' + D.svg() + '</g><g data-folha-moldura="1">' + F.svg() + "</g></svg>";
  }

  /* ------------------------------------------------------------ tabelas */
  function tabelasDe(res) {
    var loc = arr(res.locacao), nv = arr(res.niveis), vg = arr(res.tabelaVigas);
    return [
      { id: "locacao", titulo: "LOCAÇÃO DOS PILARES (CM; X E Y DO CENTRO, EM M)", cols: [{ w: 16, t: "PILAR" }, { w: 24, t: "PAVIMENTO", al: "E" }, { w: 22, t: "EIXOS" }, { w: 18, t: "X (m)" }, { w: 18, t: "Y (m)" }, { w: 22, t: "SEÇÃO (cm)" }, { w: 22, t: "BASE (m)" }, { w: 22, t: "TOPO (m)" }],
        linhas: loc.map(function (l) { return [l.marca, l.pavimento, l.eixos, br(l.x, 2), br(l.y, 2), l.secao, br(l.base, 2), br(l.topo, 2)]; }) },
      { id: "niveis", titulo: "NÍVEIS (M)", cols: [{ w: 70, t: "NÍVEL", al: "E" }, { w: 24, t: "COTA (m)" }, { w: 24, t: "FUNDO (m)" }],
        linhas: nv.map(function (x) { return [x.nome, br(x.cota, 2), x.fundo != null ? br(x.fundo, 2) : "-"]; }) },
      { id: "vigas", titulo: "VIGAS (M; SEÇÃO EM CM)", cols: [{ w: 16, t: "VIGA" }, { w: 22, t: "PAVIMENTO", al: "E" }, { w: 40, t: "INÍCIO (eixo · apoio)", al: "E" }, { w: 40, t: "FIM (eixo · apoio)", al: "E" }, { w: 18, t: "TOPO (m)" }, { w: 18, t: "FUNDO (m)" }, { w: 22, t: "SEÇÃO (cm)" }, { w: 20, t: "VÃO LIVRE (m)" }],
        linhas: vg.map(function (v) { return [v.marca, v.pavimento, txt(v.inicio.eixo) + " · " + txt(v.inicio.apoio), txt(v.fim.eixo) + " · " + txt(v.fim.apoio), br(v.topo, 2), br(v.fundo, 2), v.secao, br(v.vaoLivre, 2)]; }) }
    ];
  }

  /* ------------------------------------------------------------ gerar */
  function pavimentosDeNivel(lista) { return lista; }
  function escolherFormato(plantas, cfgFormato, avisos) {
    var P = PR(), fmts = cfgFormato && cfgFormato !== "AUTO" ? [cfgFormato] : K.formatos, i, j, q;
    for (i = 0; i < K.escalas.length; i++) {
      for (j = 0; j < fmts.length; j++) {
        var g = P.geometria(fmts[j], "paisagem", "RA"), A = g.area, ok = true, k = 1000 / K.escalas[i];
        for (q = 0; q < plantas.length && ok; q++) { var b = plantas[q].bx, w = (b.x1 - b.x0) * k + K.margEsq + K.margDir, h = (b.z1 - b.z0) * k + K.hTitulo + K.margTopo + K.margBase; if (w > A.w || h > A.h) ok = false; }
        if (ok) return { formato: fmts[j], escala: K.escalas[i], geo: g };
      }
    }
    var gU = P.geometria(fmts[fmts.length - 1], "paisagem", "RA");
    avisos.push("A planta não cabe nem em " + fmts[fmts.length - 1] + " a 1:" + K.escalas[K.escalas.length - 1] + ": a escala ficou em 1:" + K.escalas[K.escalas.length - 1] + " (confira o tamanho da folha).");
    return { formato: fmts[fmts.length - 1], escala: K.escalas[K.escalas.length - 1], geo: gU };
  }

  function gerar(entrada, opcoes) {
    var op = opcoes || {}, avisos = [], P = PR(), estado = entrada && entrada.estado, res = entrada && entrada.res;
    if (!estado || !res) return { ok: false, folhas: [], avisos: ["Sem modelo de estrutura: rode o Sugerir estrutura antes."] };
    if (!P || !P.carimboRA || !AP() || !DS() || !ES()) return { ok: false, folhas: [], avisos: ["Os motores das pranchas não carregaram (js/prancha.js, js/acopranchas.js, js/arqdesenho.js)."] };
    if (!arr(estado.caixas).some(ehEstrutura)) return { ok: false, folhas: [], avisos: ["Não há estrutura lançada: rode o Sugerir estrutura antes."] };
    var eixos = res.eixos || { horizontais: [], verticais: [] }, niveis = niveisDaVista(res);
    if (!niveis.length) return { ok: false, folhas: [], avisos: ["Sem níveis para desenhar (res.niveis vazio)."] };
    var prefixo = (txt(op.prefixo).trim() || "EST").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || "EST", rev = (txt(op.revisao).trim() || "R00").toUpperCase(), data = txt(op.data).trim() || hoje();
    var E = estilo(op.padrao), plantas = [];
    niveis.forEach(function (nv) {
      var R = recorteNivel(estado, res, nv), bx = caixaDaVista(R, eixos);
      if (!bx) return;
      var tit = nv.tipo === "baldrame" ? "FÔRMA DO BALDRAME" : (nv.tipo === "terreo" || nv.tipo === "piso" ? "LOCAÇÃO DOS PILARES - " + txt(nv.nome).toUpperCase() : (nv.tipo === "cobertura" ? "FÔRMA DA COBERTURA" : "FÔRMA DO " + txt(nv.nome).toUpperCase().replace("RESPALDO — ", "RESPALDO - ")));
      var nivelLabel = nv.tipo === "baldrame" ? "BALDRAME (TOPO)" : nv.nome;
      plantas.push({ nv: nv, R: R, bx: bx, titulo: tit + " (" + nivelTxt(nv.cota) + ")", nivelLabel: nivelLabel });
    });
    if (!plantas.length) return { ok: false, folhas: [], avisos: avisos.concat(["Nenhuma planta pôde ser montada."]) };
    var fe = escolherFormato(plantas, op.formato, avisos), geo = fe.geo, A = geo.area, k = 1000 / fe.escala;
    var caixaGlobal = null; plantas.forEach(function (p) { caixaGlobal = juntaBbox(caixaGlobal, p.bx); });
    var cortes = definirCortes(estado, res, eixos, caixaGlobal);
    var emp = op.empresa, empObj = emp && typeof emp === "object" ? emp : null;

    /* ----- as folhas: plantas, cortes, tabelas */
    var defs = [], desenhos = [];
    plantas.forEach(function (p, i) { defs.push({ id: "planta-" + (i + 1), tipo: "planta", titulo: p.titulo, nivel: p.nv.tipo + ":" + p.nv.nome, planta: p }); });
    /* cortes: encaixa em prateleiras (uma folha pode levar vários) */
    var yMin = 1e18, yMax = -1e18; niveis.forEach(function (nv) { yMin = Math.min(yMin, nv.cota); yMax = Math.max(yMax, nv.cota); });
    arr(res.niveis).forEach(function (x) { if (x.fundo != null) yMin = Math.min(yMin, x.fundo); });
    yMin -= 0.3; yMax += 0.8;
    var niveisCorte = arr(res.niveis).map(function (x) { return x.cota; });
    var cc = { k: k, escala: fe.escala, estado: estado, yMin: yMin, yMax: yMax, niveisCorte: niveisCorte };
    var cxs = cortes.map(function (ct) { return { ct: ct, w: (ct.ate - ct.de) * k + 30, h: (yMax - yMin) * k + K.hTitulo + 10 }; });
    var folhasCorte = [], cur = null;
    cxs.forEach(function (q) {
      if (!cur || cur.y + q.h > A.h || q.w > A.w) {
        if (cur && cur.itens.length && q.w <= A.w) { /* nova folha */ }
        if (!cur || cur.itens.length) { cur = { itens: [], x: 0, y: 0, hMax: 0 }; folhasCorte.push(cur); }
      }
      if (cur.x + q.w > A.w) { cur.y += cur.hMax; cur.x = 0; cur.hMax = 0; if (cur.y + q.h > A.h) { cur = { itens: [], x: 0, y: 0, hMax: 0 }; folhasCorte.push(cur); } }
      cur.itens.push({ q: q, x: cur.x, y: cur.y }); cur.x += q.w; cur.hMax = Math.max(cur.hMax, q.h);
    });
    folhasCorte.forEach(function (f, i) { defs.push({ id: "cortes-" + (i + 1), tipo: "cortes", titulo: "CORTES" + (f.itens.length ? " " + f.itens.map(function (it) { return it.q.ct.letra + it.q.ct.letra; }).join(", ") : ""), nivel: "cortes", corte: f }); });
    /* tabelas: fluxo com quebra de linhas entre folhas */
    var T = tabelasDe(res), hlinha = Math.max(4.4, (E.T.tabela || 2.4) * 1.85), hCab = (E.T.tabelaCab || 2.4) * 1.3 + 4.6, hTit = K.hTitulo + 1, folhasTab = [], ft = null;
    function novaTab() { ft = { blocos: [], y: 2 }; folhasTab.push(ft); }
    T.forEach(function (tb) {
      var i = 0, cont = false;
      if (!tb.linhas.length) return;
      if (!ft) novaTab();
      while (i < tb.linhas.length) {
        var livre = A.h - ft.y - 4 - hTit - hCab - 2, cab = Math.floor(livre / hlinha);
        if (cab < 3 && ft.blocos.length) { novaTab(); continue; }
        cab = Math.max(1, cab);
        var fatia = tb.linhas.slice(i, i + cab);
        ft.blocos.push({ tb: tb, y: ft.y, linhas: fatia, cont: cont });
        ft.y += hTit + hCab + fatia.length * hlinha + 6; i += fatia.length; cont = true;
        if (i < tb.linhas.length) novaTab();
      }
    });
    folhasTab.forEach(function (f, i) { defs.push({ id: "tabelas-" + (i + 1), tipo: "tabelas", titulo: "TABELAS DE ESTRUTURA", nivel: "tabelas", tab: f }); });
    defs.forEach(function (d, i) { d.rotulo = dois(i + 1); d.numero = prefixo + "-" + d.rotulo; });
    var total = defs.length;
    var c = { E: E, geo: geo, A: A, total: total, avisos: avisos, empObj: empObj, op: { logo: op.logo }, rev: rev, eixos: eixos, k: k, escala: fe.escala, caixaGlobal: caixaGlobal, cortes: cortes, seq: "01", estado: estado };

    var janela = [A.x - 1, A.y - 1, A.x + A.w + 1, A.y + A.h + 1], verificacao = { total: 0, textoTexto: 0, textoLinha: 0, foraJanela: 0, porFolha: [] }, feitas = [];
    defs.forEach(function (def) {
      var D = DS().novo(E, true);
      try {
        if (def.tipo === "planta") {
          c.seq = def.rotulo; def.planta.nv.titulo = def.titulo;
          /* cada planta usa a caixa DELA, ancorada no canto da área */
          var cLocal = {}; Object.keys(c).forEach(function (kk) { cLocal[kk] = c[kk]; }); cLocal.caixaGlobal = def.planta.bx;
          desenharPlanta(D, E, cLocal, def.planta.nv, def.planta.R, k, { x: A.x, y: A.y, w: A.w, h: A.h, obj: A });
        } else if (def.tipo === "cortes") {
          def.corte.itens.forEach(function (it) {
            cc.larg = it.q.w; cc.alt = it.q.h - 4;
            desenharCorte(D, E, cc, it.q.ct, A, A.x + it.x, A.y + it.y);
          });
        } else if (def.tipo === "tabelas") {
          def.tab.blocos.forEach(function (bl) {
            var y = A.y + bl.y;
            if (!bl.cont) DS().titulo(D, A.x + 2, y, bl.tb.titulo, "SEM ESCALA", def.rotulo);
            else DS().titulo(D, A.x + 2, y, bl.tb.titulo + " (CONT.)", "SEM ESCALA", def.rotulo);
            y += hTit;
            D.tabela(A.x + 2, y, bl.tb.cols, bl.linhas, { fs: E.T.tabela, hl: hlinha });
          });
        }
      } catch (e) {
        avisos.push("Folha " + def.numero + " (" + def.titulo + "): " + (e && e.message ? e.message : String(e)));
        D.texto(A.x + 10, A.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: "#c00000" });
      }
      feitas.push(D);
    });

    var emp0 = empObj ? "" : txt(emp), revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "concvista", nome: "Estrutura de concreto - vista de estrutura", formato: fe.formato, orientacao: "paisagem", origem: "estrutura-vista",
      carimbo: { modelo: "RA", empresa: emp0, responsavel: txt(op.responsavel), registro: txt(op.registro), titulo: txt(op.tituloProfissional), obra: txt(op.obra), proprietario: txt(op.proprietario),
                 contratante: txt(op.contratante), local: txt(op.local), codigo: prefixo, data: data, revisoes: [[revNum, txt(op.descricaoRevisao) || "VISTA DE ESTRUTURA - PRÉ-DIMENSIONAMENTO", data]] },
      folhas: defs.map(function (d, i) { return { id: d.id, n: i + 1, conteudo: d.titulo, escala: d.tipo === "tabelas" ? "SEM ESCALA" : "1:" + fe.escala, numero: prefixo + " " + rev }; }) });
    var folhas = defs.map(function (def, i) {
      var D = feitas[i], conf = DS().conferir(D, janela);
      verificacao.textoTexto += conf.textoTexto.length; verificacao.textoLinha += conf.textoLinha.length; verificacao.foraJanela += conf.foraJanela.length; verificacao.total += conf.total;
      verificacao.porFolha.push({ numero: def.numero, textoTexto: conf.textoTexto, textoLinha: conf.textoLinha, foraJanela: conf.foraJanela, detalhe: conf.detalhe || [] });
      var svg = montarFolha(c, def, D, pr, pr.folhas[i], geo, E);
      var o = { id: def.id, tipo: def.tipo, rotulo: def.rotulo, numero: def.numero, titulo: def.titulo, nivel: def.nivel, formato: fe.formato, escala: def.tipo === "tabelas" ? "SEM ESCALA" : "1:" + fe.escala, svg: svg };
      if (op.depurar) o.caixasTexto = D.caixas;
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, formato: fe.formato, escala: fe.escala, avisos: avisos, verificacao: verificacao, prefixo: prefixo, revisao: rev, assinatura: assinatura(estado), cortes: cortes.map(function (q) { return { letra: q.letra, tipo: q.tipo, v: q.v, motivo: q.motivo }; }),
      lista: folhas.map(function (f) { return { numero: f.numero, titulo: f.titulo, formato: f.formato, escala: f.escala }; }) };
  }

  function exportar(r, formato) {
    if (!r || !r.ok) return null;
    if (formato === "svg") return r.folhas.map(function (f) { return { nome: f.numero + " " + f.titulo + ".svg", svg: f.svg }; });
    if (formato === "pdf") { var S = PDF(); return S ? S.pdf(r.folhas.map(function (f) { return f.svg; }), { titulo: "Vista de estrutura", imagensPorChave: {} }) : null; }
    return null;
  }

  var ConcVista = { VERSAO: 1, AVISO: AVISO, gerar: gerar, exportar: exportar, assinatura: assinatura, _int: { ret: ret, trechosDaLinha: trechosDaLinha, definirCortes: definirCortes, niveisDaVista: niveisDaVista, recorteNivel: recorteNivel, tabelasDe: tabelasDe, K: K } };
  global.ConcVista = ConcVista;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcVista;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

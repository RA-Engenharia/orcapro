/* =====================================================================
 * dxf.js — Parser de DXF ASCII (motor PURO, Node-testável). window.DXF.
 * Primeiro degrau da reconstrução 2D→3D (Fase C): lê a planta baixa
 * exportada do AutoCAD/QCAD/LibreCAD e devolve os SEGMENTOS em METROS,
 * por layer, prontos pro detector de paredes (js/planta3d.js).
 *
 * Suporte (o que uma planta baixa 2D realmente usa):
 *   LINE · LWPOLYLINE · POLYLINE+VERTEX/SEQEND · ARC · CIRCLE (discretizados)
 *   TEXT/MTEXT (rótulos de ambientes) · $INSUNITS do HEADER (unidade)
 *   P11 (terreno, 09/10/2026): a COTA (z) — LINE (30/31), LWPOLYLINE
 *   (elevação 38), POLYLINE 3D (30 do VERTEX; 30 do cabeçalho na 2D) e
 *   POINT (ponto cotado do levantamento, em `pontos`). O segmento ganha
 *   z1/z2 só quando o arquivo diz a cota; sem cota, fica como era.
 *   Projeto→orçamento (14/11/2026):
 *   · BLOCKS + INSERT: cada inserção sai em `inserts` (nome do bloco, ponto, rotação, escala, espelho,
 *     ATRIBUTOS, caixa do bloco no mundo, nível de aninhamento). Blocos aninhados são seguidos (até 8 níveis,
 *     com trava de ciclo). A GEOMETRIA de dentro dos blocos só vira segmento com `opts.blocos: true` —
 *     sem a opção, a saída de segmentos é a de sempre (quem já usa o parser não muda).
 *   · Extrusão (0,0,-1) — bloco espelhado pelo CAD: aplicada (OCS → mundo).
 *   · HATCH: o CONTORNO (caminhos polilinha e arestas linha/arco) sai em `hachuras`, com a área; não vira segmento.
 *   · DIMENSION: não é desenhada (é cota), mas é CONTADA em stats.dimensoes.
 *   · Leitura em fluxo: varre o texto por posição (indexOf), sem montar a lista de pares do arquivo inteiro.
 * DXF é pares de linhas (código, valor). DWG é binário — NÃO suportado
 * (instrução honesta na UI: converter pra DXF no próprio CAD).
 * ===================================================================== */
(function (global) {
  "use strict";

  // $INSUNITS -> metros por unidade do arquivo (0 = sem unidade declarada)
  var INSUNITS = { 0: 0, 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 7: 1000, 8: 0.0000254, 9: 0.0254 / 1000, 10: 0.9144 };
  var MAX_NIVEL = 8;
  var GEOM = { LINE: 1, LWPOLYLINE: 1, POLYLINE: 1, ARC: 1, CIRCLE: 1, POINT: 1, VERTEX: 1, SEQEND: 1 };
  /* entidades cujas coordenadas estão no OCS (a extrusão 0,0,-1 espelha o X); LINE e POINT estão no mundo */
  var OCS = { LWPOLYLINE: 1, ARC: 1, CIRCLE: 1, TEXT: 1, MTEXT: 1, INSERT: 1, HATCH: 1, ATTRIB: 1 };

  /* leitor de pares em fluxo: (código, valor) por posição no texto */
  function Leitor(texto) {
    var t = String(texto || "");
    if (t.indexOf("\n") < 0 && t.indexOf("\r") >= 0) t = t.replace(/\r/g, "\n");
    this.t = t; this.p = 0; this.n = t.length;
  }
  Leitor.prototype.linha = function () {
    if (this.p >= this.n) return null;
    var q = this.t.indexOf("\n", this.p); if (q < 0) q = this.n;
    var s = this.t.slice(this.p, q); this.p = q + 1;
    if (s.length && s.charCodeAt(s.length - 1) === 13) s = s.slice(0, -1);
    return s;
  };
  /* devolve [cod, valor] ou null. Linha de código ilegível: pula UMA linha e tenta de novo (re-sincroniza) */
  Leitor.prototype.par = function () {
    for (;;) {
      var c = this.linha(); if (c === null) return null;
      var cod = parseInt(c, 10);
      if (isNaN(cod)) continue;
      var v = this.linha(); if (v === null) return null;
      return [cod, v.trim()];
    }
  };

  function discretizarArco(cx, cy, r, a0, a1, out, layer) {
    // ângulos do DXF em GRAUS, sentido anti-horário; a1 < a0 significa cruzar 0°
    var ini = a0 * Math.PI / 180, fim = a1 * Math.PI / 180;
    while (fim <= ini) fim += Math.PI * 2;
    var n = Math.max(4, Math.ceil((fim - ini) / (Math.PI / 8))); // ~22,5° por segmento
    var px = cx + r * Math.cos(ini), py = cy + r * Math.sin(ini);
    for (var i = 1; i <= n; i++) {
      var a = ini + (fim - ini) * i / n;
      var qx = cx + r * Math.cos(a), qy = cy + r * Math.sin(a);
      out.push({ x1: px, y1: py, x2: qx, y2: qy, layer: layer, curva: true });
      px = qx; py = qy;
    }
  }

  /* afim 2D: x' = a·x + c·y + e ; y' = b·x + d·y + f */
  var IDENT = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, id: true };
  function mul(T, M) {
    return { a: T.a * M.a + T.c * M.b, b: T.b * M.a + T.d * M.b, c: T.a * M.c + T.c * M.d, d: T.b * M.c + T.d * M.d, e: T.a * M.e + T.c * M.f + T.e, f: T.b * M.e + T.d * M.f + T.f };
  }
  var ESPELHO_X = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  /* ---------------------------------------------------------------- leitura de uma entidade (par a par) */
  function alimentar(ent, cod, val) {
    var f = parseFloat(val);
    if (ent.tipo === "HATCH") { if (cod === 8) ent.layer = val; else if (cod === 67) { if (parseInt(val, 10) === 1) ent.paper = true; } else if (cod === 230) ent.ez = f; else if (cod === 2 && !ent.padrao) ent.padrao = val; ent.raw.push([cod, f, val]); return; }
    if (ent.tipo === "POLYLINE" && ent._vert) {
      if (cod === 10) ent._vert.x = f;
      else if (cod === 20) { ent._vert.y = f; if (ent._vert.x != null) { ent.verts.push([ent._vert.x, ent._vert.y]); ent._vert = { x: null, y: null }; } }
      else if (cod === 30) { var uz = ent.verts[ent.verts.length - 1]; if (uz && ent._vert.x == null) uz[3] = f; }   /* P11: a cota do vértice 3D */
      else if (cod === 42) { var ub = ent.verts[ent.verts.length - 1]; if (ub) ub[2] = f; }
      else if (cod === 8) ent.layer = val;
      else if (cod === 70 && (parseInt(val, 10) & 1)) ent.fechada = true;
      return;
    }
    var ins = ent.tipo === "INSERT";
    if (ent.tipo === "DIMENSION") { if (cod === 13) ent.x13 = f; else if (cod === 23) ent.y23 = f; else if (cod === 14) ent.x14 = f; else if (cod === 24) ent.y24 = f; else if (cod === 42) ent.medida = f; else if (cod === 1) { ent.txt = val; return; } }
    switch (cod) {
      case 8: ent.layer = val; break;
      case 67: if (parseInt(val, 10) === 1) ent.paper = true; break;
      case 2: if (ins || ent.tipo === "ATTRIB") ent.nome = val; break;
      case 10: if (ent.tipo === "LWPOLYLINE") ent.verts.push([f, null, 0]); else ent.x10 = f; break;
      case 20:
        if (ent.tipo === "LWPOLYLINE") { var ult = ent.verts[ent.verts.length - 1]; if (ult && ult[1] === null) ult[1] = f; }
        else ent.y20 = f; break;
      case 11: ent.x11 = f; break;
      case 21: ent.y21 = f; break;
      case 30: ent.z10 = f; break;   /* P11: cota (LINE, POINT, cabeçalho da POLYLINE 2D, centro do ARC/CIRCLE) */
      case 31: ent.z11 = f; break;
      case 38: ent.elev = f; break;  /* P11: elevação da LWPOLYLINE (curva de nível) */
      case 40: ent.r = f; break;
      case 41: if (ins) ent.sx = f; break;
      case 42: if (ent.tipo === "LWPOLYLINE") { var uv = ent.verts[ent.verts.length - 1]; if (uv) uv[2] = f; } else if (ins) ent.sy = f; break;
      case 43: if (ins) ent.sz = f; break;
      case 44: if (ins) ent.dc = f; break;
      case 45: if (ins) ent.dl = f; break;
      case 50: ent.a0 = f; break;
      case 51: ent.a1 = f; break;
      case 66: if (ins && parseInt(val, 10) === 1) ent.temAtrib = true; break;
      case 70: if (ins) ent.nc = parseInt(val, 10) || 1; else if (parseInt(val, 10) & 1) ent.fechada = true; break;
      case 71: if (ins) ent.nl = parseInt(val, 10) || 1; break;
      case 230: ent.ez = f; break;
      case 1: ent.txt = (ent.txt || "") + val; break;
      case 3: ent.txt = (ent.txt || "") + val; break; // continuação do MTEXT
    }
  }

  /* ---------------------------------------------------------------- HATCH: contornos crus → [[x,y],…] */
  function contornosHatch(raw) {
    var out = [], i = 0, n = raw.length;
    while (i < n && raw[i][0] !== 91) i++;
    if (i >= n) return out;
    var nPaths = raw[i][1] | 0; i++;
    function arcoPts(cx, cy, r, a0, a1, ccw, pts) {
      if (!ccw) { var t0 = -a1, t1 = -a0; a0 = t0; a1 = t1; }
      var ini = a0 * Math.PI / 180, fim = a1 * Math.PI / 180; while (fim <= ini) fim += Math.PI * 2;
      var k = Math.max(3, Math.ceil((fim - ini) / (Math.PI / 8)));
      for (var s = 0; s <= k; s++) { var a = ini + (fim - ini) * s / k; pts.push([cx + r * Math.cos(a), ccw ? cy + r * Math.sin(a) : cy - r * Math.sin(a)]); }
      if (!ccw) { /* sentido horário: a lista foi gerada espelhada em y; corrige a ordem */ }
    }
    for (var p = 0; p < nPaths && i < n; p++) {
      while (i < n && raw[i][0] !== 92) i++;
      if (i >= n) break;
      var flag = raw[i][1] | 0; i++;
      var pts = [];
      if (flag & 2) {
        var temBulge = 0, nv = 0;
        while (i < n && raw[i][0] !== 93) { if (raw[i][0] === 72) temBulge = raw[i][1] | 0; i++; }
        nv = i < n ? raw[i][1] | 0 : 0; i++;
        for (var v = 0; v < nv && i < n; v++) {
          var x = null, y = null;
          while (i < n && raw[i][0] !== 10) i++;
          if (i < n) { x = raw[i][1]; i++; }
          if (i < n && raw[i][0] === 20) { y = raw[i][1]; i++; }
          if (temBulge && i < n && raw[i][0] === 42) i++;
          if (x != null && y != null) pts.push([x, y]);
        }
      } else {
        while (i < n && raw[i][0] !== 93) i++;
        var ne = i < n ? raw[i][1] | 0 : 0; i++;
        for (var e = 0; e < ne && i < n; e++) {
          while (i < n && raw[i][0] !== 72) i++;
          if (i >= n) break;
          var tp = raw[i][1] | 0; i++;
          var g = {};
          while (i < n && raw[i][0] !== 72 && raw[i][0] !== 97 && raw[i][0] !== 92) {
            var cd = raw[i][0];
            if (g[cd] === undefined) g[cd] = raw[i][1];
            i++;
            if (tp === 1 && g[21] !== undefined) break;
            if (tp === 2 && g[73] !== undefined) break;
          }
          if (tp === 1 && g[10] !== undefined) { if (!pts.length) pts.push([g[10], g[20]]); pts.push([g[11], g[21]]); }
          else if (tp === 2 && g[40] > 0) { var ap = []; arcoPts(g[10], g[20], g[40], g[50] || 0, g[51] || 0, g[73] !== 0, ap); for (var q = 0; q < ap.length; q++) pts.push(ap[q]); }
        }
      }
      while (i < n && raw[i][0] !== 97) { if (raw[i][0] === 92) break; i++; }
      if (pts.length >= 3) out.push(pts);
    }
    return out;
  }
  /* escape unicode do AutoCAD (\U+00C1) e códigos de controle (%%c, %%d, %%p, %%%) → caractere */
  function decodTxt(t) {
    return String(t || "").replace(/\\U\+([0-9A-Fa-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%%/g, "%");
  }
  function areaPoli(pts) { var s = 0; for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }

  var DXF = {
    UNIDADES: INSUNITS,
    _decodTxt: decodTxt,

    // texto DXF -> { segmentos:[{x1,y1,x2,y2,layer,curva?,bloco?}], textos:[{txt,x,y,layer}],
    //   layers:{nome:qtd}, unidade:{insunits,fator,origem}, extents:{x0,y0,x1,y1}, stats,
    //   inserts:[{nome,layer,x,y,rot,sx,sy,espelhado,atribs,cx,cy,w,h,nivel,pai}], hachuras:[{layer,padrao,contornos,area}],
    //   blocos:{nome:{n, usos}} }
    // opts.fatorUnidade: override do usuário (metros por unidade do arquivo)
    // opts.blocos: true → a geometria de dentro dos blocos vira segmento (com `bloco`)
    parse: function (texto, opts) {
      opts = opts || {};
      var L0 = new Leitor(texto);
      var segs = [], textos = [], layers = {}, insunits = 0, pontos = [];   /* P11: pontos cotados (POINT) */
      var inserts = [], hachuras = [], blocos = {}, topo = [], cotas = [];   /* cotas: DIMENSION com os pontos medidos (13/14) e a medida (42) */
      var sem = { ignoradas: {} }, stats2 = { dimensoes: 0, blocosFaltando: {}, ciclos: 0, profundos: 0, atributos: 0 };

      /* ---- 1ª passada (fluxo): HEADER ($INSUNITS), BLOCKS (definições) e ENTITIES (lista de entidades) */
      var secao = "", pr, esperaNomeSecao = false, insuFlag = false;
      var bloco = null, emCabBloco = false, ent = null, ultimoInsert = null, alvo = null;
      function fechar() {
        if (!ent) return;
        var e = ent; ent = null;
        if (e.tipo === "ATTRIB") { if (ultimoInsert && e.nome) { ultimoInsert.atribs = ultimoInsert.atribs || {}; ultimoInsert.atribs[e.nome] = decodTxt(e.txt); } if (alvo === topo) stats2.atributos++; return; }
        if (e.tipo === "SEQEND" && ultimoInsert) { ultimoInsert = null; return; }
        if (e.tipo === "VERTEX" || e.tipo === "SEQEND" || e.tipo === "ENDBLK" || e.tipo === "ATTDEF") { if (e.tipo === "ATTDEF") sem.ignoradas.ATTDEF = (sem.ignoradas.ATTDEF || 0) + 0; return; }
        ultimoInsert = (e.tipo === "INSERT" && e.temAtrib) ? e : null;
        if (alvo) alvo.push(e);
      }
      while ((pr = L0.par()) !== null) {
        var cod = pr[0], val = pr[1];
        if (cod === 0 && val === "SECTION") { fechar(); esperaNomeSecao = true; secao = ""; continue; }
        if (esperaNomeSecao && cod === 2) { secao = val; esperaNomeSecao = false; alvo = secao === "ENTITIES" ? topo : null; continue; }
        if (cod === 0 && val === "ENDSEC") { fechar(); if (secao === "ENTITIES") { secao = ""; alvo = null; } else { secao = ""; alvo = null; } bloco = null; continue; }
        if (cod === 0 && val === "EOF") { fechar(); break; }
        if (secao === "HEADER") {
          if (cod === 9) insuFlag = val === "$INSUNITS";
          else if (insuFlag && cod === 70) { insunits = parseInt(val, 10) || 0; insuFlag = false; }
          continue;
        }
        if (secao === "BLOCKS") {
          if (cod === 0 && val === "BLOCK") { fechar(); bloco = { nome: "", bx: 0, by: 0, ents: [] }; emCabBloco = true; alvo = null; continue; }
          if (cod === 0 && val === "ENDBLK") { fechar(); if (bloco && bloco.nome) blocos[bloco.nome] = bloco; bloco = null; emCabBloco = false; alvo = null; continue; }
          if (emCabBloco) {
            if (cod === 0) { emCabBloco = false; alvo = bloco ? bloco.ents : null; }
            else { if (cod === 2 && bloco) bloco.nome = val; else if (cod === 10 && bloco) bloco.bx = parseFloat(val) || 0; else if (cod === 20 && bloco) bloco.by = parseFloat(val) || 0; continue; }
          }
          if (!bloco) continue;
        } else if (secao !== "ENTITIES") continue;
        if (cod === 0) {
          // VERTEX pertence à POLYLINE aberta; SEQEND a encerra
          if (val === "VERTEX" && ent && ent.tipo === "POLYLINE") { ent._vert = { x: null, y: null }; continue; }
          if (val === "SEQEND" && ent && ent.tipo === "POLYLINE") { fechar(); continue; }
          fechar();
          ent = { tipo: val, verts: [] };
          if (val === "HATCH") ent.raw = [];
          continue;
        }
        if (ent) alimentar(ent, cod, val);
      }
      fechar();

      /* ---- 2ª passada: emitir a geometria (topo + blocos expandidos) com a transformação de cada inserção */
      var caixaCache = {};
      function caixaBloco(nome, pilha) {
        if (caixaCache[nome] !== undefined) return caixaCache[nome];
        caixaCache[nome] = null;   /* trava de ciclo durante o cálculo */
        var B = blocos[nome]; if (!B) return null;
        var col = { segs: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        var T = { a: 1, b: 0, c: 0, d: 1, e: -B.bx, f: -B.by };
        B.ents.forEach(function (e) { emitir(e, T, null, 1, nome, pilha.concat([nome]), col); });
        var cx = isFinite(col.x0) ? { x0: col.x0, y0: col.y0, x1: col.x1, y1: col.y1 } : null;
        caixaCache[nome] = cx;
        return cx;
      }
      function emitir(ent, T, layerPai, nivel, nomeBloco, pilha, coletor) {
        if (nivel === 0 && ent.paper) { sem.ignoradas["paper-space"] = (sem.ignoradas["paper-space"] || 0) + 1; return; } // 67=1: margem/carimbo da prancha, não é planta
        var L = ent.layer || "0";
        if (layerPai && L === "0") L = layerPai;   /* camada 0 dentro do bloco herda a da inserção (regra do DXF) */
        if (ent.ez < 0 && OCS[ent.tipo]) T = mul(T, ESPELHO_X);
        var geo = !!coletor || nivel === 0 || opts.blocos === true;
        var ident = T === IDENT;
        function tx(x, y) { return ident ? [x, y] : [T.a * x + T.c * y + T.e, T.b * x + T.d * y + T.f]; }
        /* P11: a cota da entidade (LWPOLYLINE 38; POLYLINE/CIRCLE/ARC 30) quando o vértice não traz a dele */
        var zEnt = isFinite(ent.elev) ? ent.elev : (isFinite(ent.z10) ? ent.z10 : null);
        function addSeg(x1, y1, x2, y2, curva, z1, z2) {
          if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return;
          if (x1 === x2 && y1 === y2) return; // degenerado
          if (!ident) { var p = tx(x1, y1), q = tx(x2, y2); x1 = p[0]; y1 = p[1]; x2 = q[0]; y2 = q[1]; }
          if (coletor) {
            if (x1 < coletor.x0) coletor.x0 = x1; if (x2 < coletor.x0) coletor.x0 = x2; if (y1 < coletor.y0) coletor.y0 = y1; if (y2 < coletor.y0) coletor.y0 = y2;
            if (x1 > coletor.x1) coletor.x1 = x1; if (x2 > coletor.x1) coletor.x1 = x2; if (y1 > coletor.y1) coletor.y1 = y1; if (y2 > coletor.y1) coletor.y1 = y2;
            return;
          }
          var sg = { x1: x1, y1: y1, x2: x2, y2: y2, layer: L, curva: !!curva };
          if (nomeBloco) sg.bloco = nomeBloco;
          if (ident && z1 != null && z2 != null && isFinite(z1) && isFinite(z2)) { sg.z1 = z1; sg.z2 = z2; }   /* P11 */
          segs.push(sg);
          layers[L] = (layers[L] || 0) + 1;
        }
        var t = ent.tipo;
        if (t === "INSERT") { emitirInsert(ent, T, L, nivel, nomeBloco, pilha, coletor); return; }
        if (t === "DIMENSION") { if (!coletor) { stats2.dimensoes++; if (isFinite(ent.x13) && isFinite(ent.x14)) { var c1 = tx(ent.x13, ent.y23 || 0), c2 = tx(ent.x14, ent.y24 || 0); cotas.push({ x1: c1[0], y1: c1[1], x2: c2[0], y2: c2[1], medida: isFinite(ent.medida) ? ent.medida : null, texto: ent.txt ? decodTxt(ent.txt) : "", layer: L }); } if (nivel === 0) sem.ignoradas.DIMENSION = (sem.ignoradas.DIMENSION || 0) + 1; } return; }
        if (t === "HATCH") {
          if (!coletor && geo) {
            var cs = contornosHatch(ent.raw || []).map(function (pts) { return pts.map(function (p) { return tx(p[0], p[1]); }); });
            if (cs.length) hachuras.push({ layer: L, padrao: ent.padrao || "", contornos: cs, bloco: nomeBloco || "" });
          }
          if (nivel === 0) sem.ignoradas.HATCH = (sem.ignoradas.HATCH || 0) + 1;
          return;
        }
        if (!geo) return;
        if (t === "LINE") addSeg(ent.x10, ent.y20, ent.x11, ent.y21, false, ent.z10, isFinite(ent.z11) ? ent.z11 : ent.z10);
        else if (t === "POINT") { if (!coletor && isFinite(ent.x10) && isFinite(ent.y20)) { var pp = tx(ent.x10, ent.y20); pontos.push({ x: pp[0], y: pp[1], z: isFinite(ent.z10) ? ent.z10 : null, layer: L }); } }   /* P11 */
        else if (t === "LWPOLYLINE" || t === "POLYLINE") {
          var vs = ent.verts || [];
          var trecho = function (p, q) {
            var b = p[2] || 0; // bulge (código 42): arco entre p e q — achado do gate: ignorar virava corda reta MUDA
            var zp = isFinite(p[3]) ? p[3] : zEnt, zq = isFinite(q[3]) ? q[3] : zEnt;   /* P11: a cota do vértice (POLYLINE 3D) ou a da entidade */
            if (!b || !isFinite(b)) { addSeg(p[0], p[1], q[0], q[1], false, zp, zq); return; }
            var th = 4 * Math.atan(b); // ângulo central (sinal = sentido)
            var dx = q[0] - p[0], dy = q[1] - p[1], d = Math.sqrt(dx * dx + dy * dy) / 2;
            if (!(d > 0)) return;
            var h = b * d; // sagitta assinada
            var r = (d * d + h * h) / (2 * Math.abs(h) || 1e-12);
            var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
            var nx2 = -dy / (2 * d), ny2 = dx / (2 * d); // normal unitária à corda
            var lado = b > 0 ? 1 : -1;
            var cxA = mx - nx2 * (r - Math.abs(h)) * lado, cyA = my - ny2 * (r - Math.abs(h)) * lado;
            var a0 = Math.atan2(p[1] - cyA, p[0] - cxA), nseg = Math.max(3, Math.ceil(Math.abs(th) / (Math.PI / 8)));
            var px2 = p[0], py2 = p[1];
            for (var s2 = 1; s2 <= nseg; s2++) {
              var aa = a0 + th * s2 / nseg;
              var qx2 = cxA + r * Math.cos(aa), qy2 = cyA + r * Math.sin(aa);
              addSeg(px2, py2, qx2, qy2, true, zp, zq); px2 = qx2; py2 = qy2;
            }
          };
          for (var v = 0; v + 1 < vs.length; v++) trecho(vs[v], vs[v + 1]);
          if (ent.fechada && vs.length > 2) trecho(vs[vs.length - 1], vs[0]);
        }
        else if ((t === "ARC" || t === "CIRCLE") && ent.r > 0) {
          var tmp = [];
          discretizarArco(ent.x10, ent.y20, ent.r, t === "ARC" ? (ent.a0 || 0) : 0, t === "ARC" ? (ent.a1 != null ? ent.a1 : 360) : 360, tmp, L);
          for (var ia = 0; ia < tmp.length; ia++) addSeg(tmp[ia].x1, tmp[ia].y1, tmp[ia].x2, tmp[ia].y2, true, zEnt, zEnt);   /* P11: arco/círculo na cota da entidade */
        }
        if (coletor) return;
        if ((t === "TEXT" || t === "MTEXT") && ent.txt) {
          var pt = tx(ent.x10 || 0, ent.y20 || 0);
          var tt = { txt: decodTxt(ent.txt).replace(/\\P/g, " ").replace(/\{[^}]*\}|\\[A-Za-z][^;]*;/g, "").trim(), x: pt[0], y: pt[1], layer: L };
          if (nomeBloco) tt.bloco = nomeBloco;
          textos.push(tt);
        }
        else if (nivel === 0 && t && !GEOM[t] && t !== "TEXT" && t !== "MTEXT") sem.ignoradas[t] = (sem.ignoradas[t] || 0) + 1;
      }
      function emitirInsert(ent, T, L, nivel, nomeBloco, pilha, coletor) {
        if (nivel === 0) sem.ignoradas.INSERT = (sem.ignoradas.INSERT || 0) + 1;   /* contagem de sempre (a geometria só entra com opts.blocos) */
        var nome = ent.nome || "", B = blocos[nome];
        if (!B) { if (!coletor) stats2.blocosFaltando[nome] = (stats2.blocosFaltando[nome] || 0) + 1; return; }
        if (pilha.indexOf(nome) >= 0) { stats2.ciclos++; return; }
        if (nivel >= MAX_NIVEL) { stats2.profundos++; return; }
        var sx = isFinite(ent.sx) && ent.sx !== 0 ? ent.sx : 1, sy = isFinite(ent.sy) && ent.sy !== 0 ? ent.sy : 1;
        var rot = (ent.a0 || 0) * Math.PI / 180, co = Math.cos(rot), si = Math.sin(rot);
        var nc = Math.max(1, ent.nc || 1), nl = Math.max(1, ent.nl || 1), dc = ent.dc || 0, dl = ent.dl || 0;
        for (var ic = 0; ic < nc; ic++) for (var il = 0; il < nl; il++) {
          var ox = ic * dc, oy = il * dl;   /* MINSERT: grade no sistema girado da inserção */
          var ix = (ent.x10 || 0) + ox * co - oy * si, iy = (ent.y20 || 0) + ox * si + oy * co;
          var a = sx * co, b = sx * si, c = -sy * si, d = sy * co;
          var M = { a: a, b: b, c: c, d: d, e: ix - (a * B.bx + c * B.by), f: iy - (b * B.bx + d * B.by) };
          var T2 = mul(T, M);
          if (!coletor) {
            var cx = caixaBloco(nome, pilha), rec = { nome: nome, layer: L, x: 0, y: 0, rot: 0, sx: sx, sy: sy, espelhado: (T2.a * T2.d - T2.b * T2.c) < 0, atribs: ent.atribs ? JSON.parse(JSON.stringify(ent.atribs)) : {}, nivel: nivel, pai: nomeBloco || "" };
            rec.x = T.a * ix + T.c * iy + T.e; rec.y = T.b * ix + T.d * iy + T.f;
            rec.rot = Math.round(Math.atan2(T2.b, T2.a) * 180 / Math.PI * 1000) / 1000;
            if (cx) {
              /* caixa do bloco (no sistema do bloco, já sem o ponto-base) levada ao mundo: centro e tamanho */
              var mx = (cx.x0 + cx.x1) / 2, my = (cx.y0 + cx.y1) / 2;
              var Tb = mul(T2, { a: 1, b: 0, c: 0, d: 1, e: B.bx, f: B.by });
              rec.cx = Tb.a * mx + Tb.c * my + Tb.e; rec.cy = Tb.b * mx + Tb.d * my + Tb.f;
              var esc = Math.sqrt(Math.abs(T2.a * T2.d - T2.b * T2.c)) || 1, ex = Math.sqrt(T2.a * T2.a + T2.b * T2.b), ey = Math.sqrt(T2.c * T2.c + T2.d * T2.d);
              rec.w = (cx.x1 - cx.x0) * (ex || esc); rec.h = (cx.y1 - cx.y0) * (ey || esc);
            }
            inserts.push(rec);
            blocos[nome].usos = (blocos[nome].usos || 0) + 1;
            if (opts.blocos === true && ent.atribs) Object.keys(ent.atribs).forEach(function (tg) { if (ent.atribs[tg]) textos.push({ txt: ent.atribs[tg], x: rec.x, y: rec.y, layer: L, bloco: nome, atrib: tg }); });
          }
          var p2 = pilha.concat([nome]);
          for (var k = 0; k < B.ents.length; k++) emitir(B.ents[k], T2, L, nivel + 1, nome, p2, coletor);
        }
      }
      for (var it = 0; it < topo.length; it++) emitir(topo[it], IDENT, null, 0, "", [], null);

      // extents (na unidade CRUA do arquivo)
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      segs.forEach(function (s) {
        if (s.x1 < x0) x0 = s.x1; if (s.x2 < x0) x0 = s.x2;
        if (s.y1 < y0) y0 = s.y1; if (s.y2 < y0) y0 = s.y2;
        if (s.x1 > x1) x1 = s.x1; if (s.x2 > x1) x1 = s.x2;
        if (s.y1 > y1) y1 = s.y1; if (s.y2 > y1) y1 = s.y2;
      });

      // unidade -> METROS. Prioridade: override do usuário > $INSUNITS > heurística pela extensão
      // (uma edificação tem 3–300 m de envergadura; extents de 3000–300000 = milímetros, 300–30000 = cm)
      var fator, origem;
      if (opts.fatorUnidade > 0) { fator = opts.fatorUnidade; origem = "usuario"; }
      else if (insunits && INSUNITS[insunits]) { fator = INSUNITS[insunits]; origem = "insunits"; }
      else {
        var env = Math.max(x1 - x0, y1 - y0) || 0;
        if (env > 2000) { fator = 0.001; origem = "heuristica-mm"; }
        else if (env > 200) { fator = 0.01; origem = "heuristica-cm"; }
        else { fator = 1; origem = "heuristica-m"; }
      }
      if (fator > 0 && fator !== 1) {
        segs.forEach(function (s) { s.x1 *= fator; s.y1 *= fator; s.x2 *= fator; s.y2 *= fator; if (s.z1 != null) { s.z1 *= fator; s.z2 *= fator; } });
        pontos.forEach(function (q) { q.x *= fator; q.y *= fator; if (q.z != null) q.z *= fator; });   /* P11 */
        textos.forEach(function (t) { t.x *= fator; t.y *= fator; });
        cotas.forEach(function (c) { c.x1 *= fator; c.y1 *= fator; c.x2 *= fator; c.y2 *= fator; if (c.medida != null) c.medida *= fator; });
        inserts.forEach(function (r) { r.x *= fator; r.y *= fator; if (r.cx != null) { r.cx *= fator; r.cy *= fator; r.w *= fator; r.h *= fator; } });
        hachuras.forEach(function (h) { h.contornos.forEach(function (c) { c.forEach(function (p) { p[0] *= fator; p[1] *= fator; }); }); });
        x0 *= fator; y0 *= fator; x1 *= fator; y1 *= fator;
      }
      hachuras.forEach(function (h) { h.area = h.contornos.reduce(function (s, c) { return s + areaPoli(c); }, 0); });
      var resBlocos = {};
      Object.keys(blocos).forEach(function (k) { resBlocos[k] = { n: blocos[k].ents.length, usos: blocos[k].usos || 0 }; });

      return {
        segmentos: segs, textos: textos, layers: layers, pontos: pontos,
        unidade: { insunits: insunits, fator: fator, origem: origem },
        extents: segs.length ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null,
        inserts: inserts, hachuras: hachuras, blocos: resBlocos, cotas: cotas,
        stats: { segmentos: segs.length, textos: textos.length, ignoradas: sem.ignoradas, inserts: inserts.length, hachuras: hachuras.length, dimensoes: stats2.dimensoes, blocos: Object.keys(blocos).length, blocosFaltando: stats2.blocosFaltando, ciclos: stats2.ciclos, profundos: stats2.profundos, atributos: stats2.atributos }
      };
    }
  };

  global.DXF = DXF;
  if (typeof module !== "undefined" && module.exports) module.exports = DXF;
})(typeof window !== "undefined" ? window : globalThis);

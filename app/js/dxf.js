/* =====================================================================
 * dxf.js — Parser de DXF ASCII (motor PURO, Node-testável). window.DXF.
 * Primeiro degrau da reconstrução 2D→3D (Fase C): lê a planta baixa
 * exportada do AutoCAD/QCAD/LibreCAD e devolve os SEGMENTOS em METROS,
 * por layer, prontos pro detector de paredes (js/planta3d.js).
 *
 * Suporte (o que uma planta baixa 2D realmente usa):
 *   LINE · LWPOLYLINE · POLYLINE+VERTEX/SEQEND · ARC · CIRCLE (discretizados)
 *   TEXT/MTEXT (rótulos de ambientes) · $INSUNITS do HEADER (unidade)
 * DXF é pares de linhas (código, valor). DWG é binário — NÃO suportado
 * (instrução honesta na UI: converter pra DXF no próprio CAD).
 * ===================================================================== */
(function (global) {
  "use strict";

  // $INSUNITS -> metros por unidade do arquivo (0 = sem unidade declarada)
  var INSUNITS = { 0: 0, 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 7: 1000, 8: 0.0000254, 9: 0.0254 / 1000, 10: 0.9144 };

  function parsePares(texto) {
    // DXF = sequência de pares (linha código / linha valor); tolera \r\n e espaços
    var linhas = String(texto || "").split(/\r\n|\r|\n/), pares = [];
    for (var i = 0; i + 1 < linhas.length; i += 2) {
      var cod = parseInt(linhas[i], 10);
      if (isNaN(cod)) { i--; continue; } // linha solta (arquivo tolerante): re-sincroniza
      pares.push([cod, linhas[i + 1] !== undefined ? linhas[i + 1].trim() : ""]);
    }
    return pares;
  }

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

  var DXF = {
    UNIDADES: INSUNITS,

    // texto DXF -> { segmentos:[{x1,y1,x2,y2,layer,curva?}], textos:[{txt,x,y,layer}],
    //   layers:{nome:qtd}, unidade:{insunits,fator,origem}, extents:{x0,y0,x1,y1}, stats }
    // opts.fatorUnidade: override do usuário (metros por unidade do arquivo)
    parse: function (texto, opts) {
      opts = opts || {};
      var pares = parsePares(texto);
      var segs = [], textos = [], layers = {}, insunits = 0;
      var i, n = pares.length;

      // HEADER: $INSUNITS (9 "$INSUNITS" -> 70 valor)
      for (i = 0; i + 1 < n; i++) {
        if (pares[i][0] === 9 && pares[i][1] === "$INSUNITS") {
          for (var j = i + 1; j < Math.min(i + 4, n); j++) if (pares[j][0] === 70) { insunits = parseInt(pares[j][1], 10) || 0; break; }
        }
        if (pares[i][0] === 2 && pares[i][1] === "ENTITIES") break;
      }

      // ENTITIES: varre entidade a entidade (cada uma começa em código 0)
      var emEntities = false, ent = null, sem = { ignoradas: {} };
      function fecharEntidade() {
        if (!ent) return;
        if (ent.paper) { sem.ignoradas["paper-space"] = (sem.ignoradas["paper-space"] || 0) + 1; ent = null; return; } // 67=1: margem/carimbo da prancha, não é planta
        var L = ent.layer || "0";
        function addSeg(x1, y1, x2, y2, curva) {
          if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return;
          if (x1 === x2 && y1 === y2) return; // degenerado
          segs.push({ x1: x1, y1: y1, x2: x2, y2: y2, layer: L, curva: !!curva });
          layers[L] = (layers[L] || 0) + 1;
        }
        if (ent.tipo === "LINE") addSeg(ent.x10, ent.y20, ent.x11, ent.y21);
        else if (ent.tipo === "LWPOLYLINE" || ent.tipo === "POLYLINE") {
          var vs = ent.verts || [];
          function trecho(p, q) {
            var b = p[2] || 0; // bulge (código 42): arco entre p e q — achado do gate: ignorar virava corda reta MUDA
            if (!b || !isFinite(b)) { addSeg(p[0], p[1], q[0], q[1]); return; }
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
              addSeg(px2, py2, qx2, qy2, true); px2 = qx2; py2 = qy2;
            }
          }
          for (var v = 0; v + 1 < vs.length; v++) trecho(vs[v], vs[v + 1]);
          if (ent.fechada && vs.length > 2) trecho(vs[vs.length - 1], vs[0]);
        }
        else if (ent.tipo === "ARC" && ent.r > 0) { var antes = segs.length; discretizarArco(ent.x10, ent.y20, ent.r, ent.a0 || 0, ent.a1 != null ? ent.a1 : 360, segs, L); layers[L] = (layers[L] || 0) + (segs.length - antes); }
        else if (ent.tipo === "CIRCLE" && ent.r > 0) { var antes2 = segs.length; discretizarArco(ent.x10, ent.y20, ent.r, 0, 360, segs, L); layers[L] = (layers[L] || 0) + (segs.length - antes2); }
        else if ((ent.tipo === "TEXT" || ent.tipo === "MTEXT") && ent.txt) {
          textos.push({ txt: ent.txt.replace(/\\P/g, " ").replace(/\{[^}]*\}|\\[A-Za-z][^;]*;/g, "").trim(), x: ent.x10 || 0, y: ent.y20 || 0, layer: L });
        }
        else if (ent.tipo && ent.tipo !== "VERTEX" && ent.tipo !== "SEQEND") sem.ignoradas[ent.tipo] = (sem.ignoradas[ent.tipo] || 0) + 1;
        ent = null;
      }
      for (i = 0; i < n; i++) {
        var cod = pares[i][0], val = pares[i][1];
        if (cod === 2 && val === "ENTITIES") { emEntities = true; continue; } // seção = par [0,SECTION]+[2,ENTITIES]
        if (!emEntities) continue;
        if (cod === 0 && val === "ENDSEC") { fecharEntidade(); break; }
        if (cod === 0) {
          // VERTEX pertence à POLYLINE aberta; SEQEND a encerra
          if (val === "VERTEX" && ent && ent.tipo === "POLYLINE") { ent._vert = { x: null, y: null }; continue; }
          if (val === "SEQEND" && ent && ent.tipo === "POLYLINE") { fecharEntidade(); continue; }
          if (ent && ent.tipo === "POLYLINE" && ent._vert) { /* entidade nova encerra polyline sem SEQEND */ }
          fecharEntidade();
          ent = { tipo: val, verts: [] };
          continue;
        }
        if (!ent) continue;
        var f = parseFloat(val);
        if (ent.tipo === "POLYLINE" && ent._vert) {
          if (cod === 10) ent._vert.x = f;
          else if (cod === 20) { ent._vert.y = f; if (ent._vert.x != null) { ent.verts.push([ent._vert.x, ent._vert.y]); ent._vert = { x: null, y: null }; } }
          else if (cod === 8) ent.layer = val;
          else if (cod === 70 && (parseInt(val, 10) & 1)) ent.fechada = true;
          continue;
        }
        switch (cod) {
          case 8: ent.layer = val; break;
          case 67: if (parseInt(val, 10) === 1) ent.paper = true; break;
          case 10: if (ent.tipo === "LWPOLYLINE") ent.verts.push([f, null, 0]); else ent.x10 = f; break;
          case 20:
            if (ent.tipo === "LWPOLYLINE") { var ult = ent.verts[ent.verts.length - 1]; if (ult && ult[1] === null) ult[1] = f; }
            else ent.y20 = f; break;
          case 11: ent.x11 = f; break;
          case 21: ent.y21 = f; break;
          case 40: ent.r = f; break;
          case 42: if (ent.tipo === "LWPOLYLINE") { var uv = ent.verts[ent.verts.length - 1]; if (uv) uv[2] = f; } break;
          case 50: ent.a0 = f; break;
          case 51: ent.a1 = f; break;
          case 70: if (parseInt(val, 10) & 1) ent.fechada = true; break;
          case 1: ent.txt = (ent.txt || "") + val; break;
          case 3: ent.txt = (ent.txt || "") + val; break; // continuação do MTEXT
        }
      }
      fecharEntidade();
      // LWPOLYLINE com vértice incompleto (10 sem 20): descarta o incompleto
      // (já tratado no addSeg via isFinite — verts [x, null] geram NaN e caem fora)

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
        segs.forEach(function (s) { s.x1 *= fator; s.y1 *= fator; s.x2 *= fator; s.y2 *= fator; });
        textos.forEach(function (t) { t.x *= fator; t.y *= fator; });
        x0 *= fator; y0 *= fator; x1 *= fator; y1 *= fator;
      }

      return {
        segmentos: segs, textos: textos, layers: layers,
        unidade: { insunits: insunits, fator: fator, origem: origem },
        extents: segs.length ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null,
        stats: { segmentos: segs.length, textos: textos.length, ignoradas: sem.ignoradas }
      };
    }
  };

  global.DXF = DXF;
  if (typeof module !== "undefined" && module.exports) module.exports = DXF;
})(typeof window !== "undefined" ? window : globalThis);

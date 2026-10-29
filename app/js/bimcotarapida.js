/* =====================================================================
 * COTA RÁPIDA + TRAVA POR TECLAS (29/10/2026, pedido do Rogério) — motor puro
 *
 * "Clicar, clicar no outro, Enter e a cota já mostrar." / "Ctrl = fica na horizontal ou na vertical;
 * Ctrl+Shift = 45°; soltar = livre no mouse." Aqui só a CONTA (sem DOM, testável no Node); quem desenha é
 * js/bimcotasui.js (3D), js/bimanot2dui.js (vista 2D) e js/bimprecisaoui.js (trava).
 *
 *  · offsetPadrao ... o afastamento da linha de cota (Espaçamento): vista 2D = mm de PAPEL × escala
 *                     (7 mm em 1:50 = 0,35 m); 3D = metros (0,30);
 *  · ladoFora ....... o lado "de fora": oposto ao centro da peça/ambiente; sem peça, o lado do mouse;
 *  · direcaoAuto .... horizontal, vertical ou alinhada pela maior componente (Shift trava alinhada);
 *  · acrescentar .... a cota CONTÍNUA: cada ponto vira um trecho; se o trecho muda de direção (> 20° da
 *                     cadeia atual) a cadeia fecha e outra começa, a partir do último ponto;
 *  · travaAngulo .... Ctrl = horizontal/vertical; Ctrl+Shift = múltiplo de 45°; só Shift = orto de sempre.
 * Por que a trava lê as teclas SEGURADAS (e não só o evento do mouse): o texto da prévia tem de mudar na
 * hora em que a tecla é apertada ou solta, sem esperar o mouse andar.
 * ===================================================================== */
(function (global) {
  "use strict";
  /* até 5° do eixo a cota cai no eixo (erro do valor < 0,4%); mais que isso é a reta dos pontos, para nunca medir "torto" sem avisar */
  var TOL_EIXO = 5;
  var LIMIAR_VIRAR = 20;   /* graus: acima disso o ponto novo vira OUTRA cadeia */

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { var n = Number(String(v == null ? "" : v).replace(",", ".")); return v == null || v === "" || !isFinite(n) ? d : n; }

  /* ------------------------------------------------------------ afastamento */
  /* o = { vista: "3d"|"planta"|"corte"|"vista", escala: 50, esp3d: 0.30, espPapel: 7 } → metros */
  function offsetPadrao(o) {
    o = o || {};
    if (!o.vista || o.vista === "3d") return Math.round(num(o.esp3d, 0.3) * 1e4) / 1e4;
    var esc = num(o.escala, 50); if (!(esc > 0)) esc = 50;
    var mm = num(o.espPapel, 7); if (!(mm > 0)) mm = 7;
    return Math.round(mm * esc / 1000 * 1e4) / 1e4;
  }

  /* ------------------------------------------------------------ direção e lado */
  /* a, b: [x,y,z] ou {x,y,z}; plano = "xz" (planta, 3D) | "xy" (vista/corte 2D, [x,y]).
     → "h" | "v" | "alinhada". Perto do eixo (até 5°) vale o eixo; senão a reta dos pontos. shift trava alinhada. */
  function direcaoAuto(a, b, plano, shift) {
    var A = vet(a), B = vet(b);
    var dx = Math.abs(B[0] - A[0]), dz = Math.abs(plano === "xy" ? B[1] - A[1] : B[2] - A[2]);
    if (shift) return "alinhada";
    var mx = Math.max(dx, dz); if (mx < 1e-9) return "h";
    if (Math.min(dx, dz) <= mx * Math.tan(TOL_EIXO * Math.PI / 180)) return dx >= dz ? "h" : "v";
    return "alinhada";
  }
  function vet(p) { return Array.isArray(p) ? [num(p[0], 0), num(p[1], 0), num(p[2], 0)] : [num(p.x, 0), num(p.y, 0), num(p.z, 0)]; }
  function unit(v) { var L = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return L < 1e-12 ? null : [v[0] / L, v[1] / L, v[2] / L]; }
  /* d = direção da cota (unitária); medio = meio dos pontos; centro = centro da peça/ambiente (ou null);
     mouse = ponto do cursor (ou null). → vetor unitário PERPENDICULAR a d, apontando para fora. */
  function ladoFora(d, medio, centro, mouse, baixo) {
    var D = unit(vet(d)) || [1, 0, 0];
    /* a perpendicular no plano horizontal (para a cota vertical, o eixo X) */
    var n = Math.abs(D[1]) > 0.9 ? [1, 0, 0] : unit([-D[2], 0, D[0]]) || [1, 0, 0];
    var M = vet(medio), sinal = 0;
    function dp(alvo, deMedio) { var A = vet(alvo), r = deMedio ? [A[0] - M[0], A[1] - M[1], A[2] - M[2]] : [M[0] - A[0], M[1] - A[1], M[2] - A[2]]; return r[0] * n[0] + r[1] * n[1] + r[2] * n[2]; }
    if (centro) { var a = dp(centro, false); if (Math.abs(a) > 1e-6) sinal = a > 0 ? 1 : -1; }
    if (!sinal && mouse) { var b = dp(mouse, true); if (Math.abs(b) > 1e-6) sinal = b > 0 ? 1 : -1; }
    if (!sinal) sinal = baixo ? -1 : 1;
    return [n[0] * sinal, n[1] * sinal, n[2] * sinal];
  }
  /* o eixo (X, Y ou Z) em que a cota 3D cai sozinha: as outras duas componentes até 5° da maior. null = alinhada. */
  function eixoAuto(a, b, shift) {
    if (shift) return null;
    var A = vet(a), B = vet(b), d = [Math.abs(B[0] - A[0]), Math.abs(B[1] - A[1]), Math.abs(B[2] - A[2])], mx = Math.max(d[0], d[1], d[2]);
    if (mx < 1e-9) return null;
    var i = d.indexOf(mx), t = Math.tan(TOL_EIXO * Math.PI / 180);
    for (var j = 0; j < 3; j++) if (j !== i && d[j] > mx * t) return null;
    var u = [0, 0, 0]; u[i] = 1; return u;
  }

  /* ------------------------------------------------------------ cota contínua */
  function angEntre(u, v) {
    var a = unit(u), b = unit(v); if (!a || !b) return 0;
    var c = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]); if (c > 1) c = 1;
    return Math.acos(c) * 180 / Math.PI;   /* sem sinal: voltar pela mesma reta não vira cadeia nova */
  }
  function novaCadeia() { return { pts: [], feitas: [] }; }
  /* acrescenta o ponto p (vetor [x,y,z]); devolve { acao, cadeia } onde cadeia = a atual (pts) e fechada = a que
     acabou de fechar por mudança de direção (ou null). Não muda o objeto recebido. */
  function acrescentar(cad, p, limiar) {
    var pts = (cad && cad.pts ? cad.pts : []).map(vet), P = vet(p), lim = fin(limiar) ? limiar : LIMIAR_VIRAR;
    if (!pts.length) return { acao: "inicia", pts: [P], fechada: null };
    var ult = pts[pts.length - 1], seg = [P[0] - ult[0], P[1] - ult[1], P[2] - ult[2]];
    if (!unit(seg)) return { acao: "ignora", pts: pts, fechada: null };   /* o mesmo ponto: nada a medir */
    if (pts.length < 2) return { acao: "estende", pts: pts.concat([P]), fechada: null };
    /* a direção da cadeia = do 1º ao ÚLTIMO ponto (e não só o 1º trecho: um canto fora da linha no começo não pode quebrar a cadeia toda) */
    var dir = [ult[0] - pts[0][0], ult[1] - pts[0][1], ult[2] - pts[0][2]];
    if (angEntre(dir, seg) > lim) return { acao: "vira", pts: [ult, P], fechada: pts };
    return { acao: "estende", pts: pts.concat([P]), fechada: null };
  }

  /* ------------------------------------------------------------ trava por teclas */
  function ang(dx, dz) { return Math.atan2(-dz, dx) * 180 / Math.PI; }
  function rotuloAng(g) {
    var m = ((Math.round(g) % 360) + 360) % 360;
    if (m === 0 || m === 180) return "Horizontal";
    if (m === 90 || m === 270) return "Vertical";
    return "45°";
  }
  /* ref, p: { x, z } (metros, plano do desenho); t: { ctrl, shift }.
     → null (livre) | { p: {x,z}, tipo: "orto"|"hv"|"45", rotulo, graus } */
  function travaAngulo(ref, p, t) {
    if (!ref || !p || !t) return null;
    var dx = p.x - ref.x, dz = p.z - ref.z, L = Math.sqrt(dx * dx + dz * dz);
    var ctrl = !!t.ctrl, shift = !!t.shift;
    if (!ctrl && !shift) return null;
    if (L < 1e-9) return { p: { x: ref.x, z: ref.z }, tipo: ctrl ? (shift ? "45" : "hv") : "orto", rotulo: ctrl ? (shift ? "45°" : "Horizontal") : "Ortogonal", graus: 0 };
    if (ctrl && shift) {
      var g = ang(dx, dz), s = Math.round(g / 45) * 45, r = (g - s) * Math.PI / 180, proj = L * Math.cos(r), sr = s * Math.PI / 180;
      var q = { x: ref.x + proj * Math.cos(sr), z: ref.z - proj * Math.sin(sr) };
      if (Math.abs(q.x - ref.x) < 1e-12) q.x = ref.x; if (Math.abs(q.z - ref.z) < 1e-12) q.z = ref.z;
      return { p: q, tipo: "45", rotulo: rotuloAng(s) === "45°" ? "45°" : rotuloAng(s), graus: ((s % 360) + 360) % 360 };
    }
    if (ctrl) {
      var h = Math.abs(dx) >= Math.abs(dz);
      return { p: h ? { x: p.x, z: ref.z } : { x: ref.x, z: p.z }, tipo: "hv", rotulo: h ? "Horizontal" : "Vertical", graus: h ? (dx >= 0 ? 0 : 180) : (dz <= 0 ? 90 : 270) };
    }
    var ho = Math.abs(dx) >= Math.abs(dz);   /* só Shift: o orto de sempre (não mudar) */
    return { p: ho ? { x: p.x, z: ref.z } : { x: ref.x, z: p.z }, tipo: "orto", rotulo: "Ortogonal", graus: ho ? 0 : 90 };
  }

  /* ------------------------------------------------------------ teclas seguradas */
  var held = { ctrl: false, shift: false };
  function teclas() { return { ctrl: held.ctrl, shift: held.shift }; }
  /* Ctrl/Cmd e Shift do evento (pointer ou teclado) somados ao que está segurado */
  function dasTeclas(e) { return { ctrl: !!(e && (e.ctrlKey || e.metaKey)) || held.ctrl, shift: !!(e && e.shiftKey) || held.shift }; }
  var ouvintes = [];
  function aoMudar(fn) { if (typeof fn === "function") ouvintes.push(fn); }
  function avisar(ev) { ouvintes.forEach(function (fn) { try { fn(ev, teclas()); } catch (e) {} }); }
  if (typeof document !== "undefined" && document.addEventListener) {
    var atualizar = function (e, down) {
      var antes = held.ctrl + ":" + held.shift;
      if (e.key === "Control" || e.key === "Meta") held.ctrl = down;
      else if (e.key === "Shift") held.shift = down;
      else { held.ctrl = !!(e.ctrlKey || e.metaKey); held.shift = !!e.shiftKey; }
      if (antes !== held.ctrl + ":" + held.shift) avisar(e);
    };
    document.addEventListener("keydown", function (e) { atualizar(e, true); }, true);
    document.addEventListener("keyup", function (e) { atualizar(e, false); }, true);
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("blur", function () { if (held.ctrl || held.shift) { held.ctrl = held.shift = false; avisar({}); } });
  }

  var CotaRapida = {
    LIMIAR_VIRAR: LIMIAR_VIRAR,
    offsetPadrao: offsetPadrao, direcaoAuto: direcaoAuto, ladoFora: ladoFora, eixoAuto: eixoAuto,
    novaCadeia: novaCadeia, acrescentar: acrescentar, angEntre: angEntre,
    travaAngulo: travaAngulo, teclas: teclas, dasTeclas: dasTeclas, aoMudar: aoMudar,
    _setTeclas: function (c, s) { held.ctrl = !!c; held.shift = !!s; }
  };
  global.BimCotaRapida = CotaRapida;
  if (typeof module !== "undefined" && module.exports) module.exports = CotaRapida;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

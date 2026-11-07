/* =====================================================================
 * elemobiliario.js — LANÇAMENTO PELO MOBILIÁRIO (Elétrica v2, lote L3, 06/11/2026). Motor PURO, ES5, Node-testável.
 *
 * O "Lançar pontos elétricos" (js/eleauto.js) fazia TUG pelo perímetro e interruptor na porta, mas não lia móvel. Aqui o móvel pede a
 * tomada dele: cama (1 de cada lado se casal; 1 do lado livre se solteiro), rack/painel de TV (TV + equipamentos), sofá (ao lado) e
 * escrivaninha. Os números (alturas, recuos, alcance) e o NÍVEL de cada um moram em dados-fonte/eletrica/padrao-ambientes.json →
 * js/elepadraodados.js; NADA numérico aqui. Ambiente sem o móvel não pede nada (vale o perímetro, como antes).
 *
 *   EleMobiliario.pedidos({ estado, aval, L, a, dentro }) → { pedidos[], pendencias[], avisos[] }
 *     pedido = { regra, movel (id), origem ("cabeceira da cama"…), ancoras: [[x,z]…] (em ordem de preferência), h (m), alcance (m), texto, nivel }
 *   O eleauto.js escolhe a parede livre mais perto da âncora (a mesma régua de posição: vão, folha da porta, móvel alto, box) e lança.
 *   O interruptor de cabeceira NÃO é daqui: já existe na Ligação da iluminação (js/eletilum.js, regra "cabeceira").
 * Teste: node tools/test-ele-mobiliario.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function PAD() { return dep("ElePadraoDados", "./elepadraodados.js") || { mobiliario: {} }; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function dist(a, b) { var x = a[0] - b[0], z = a[1] - b[1]; return Math.sqrt(x * x + z * z); }
  function distSeg(p, a, b) { var ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez, k = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / l2)) : 0; return dist(p, [a[0] + ex * k, a[1] + ez * k]); }
  function distContorno(p, P) { var m = Infinity; for (var i = 0; i < P.length; i++) m = Math.min(m, distSeg(p, P[i], P[(i + 1) % P.length])); return m; }
  function valor(r, k) { return r && r[k] && typeof r[k] === "object" ? num(r[k].valor, null) : null; }

  /* o referencial do móvel: origem, eixo lateral (x) e eixo de profundidade (z) — o mesmo de eleauto.local / eletilum.pontosCabeceira */
  function quadro(f) {
    var r = num(f.rotY, 0), c = Math.cos(r), s = Math.sin(r), O = [num(f.x, 0), num(f.z, 0)];
    return { O: O, lx: [c, -s], lz: [s, c], pt: function (xl, zl) { return [O[0] + c * xl + s * zl, O[1] - s * xl + c * zl]; } };
  }
  /* a ponta do móvel mais perto da parede (a cabeceira, o fundo do rack, o encosto do sofá): { zl, dir (unit, para a parede), d } */
  function encosto(Q, cx, P) {
    var xm = (cx.x0 + cx.x1) / 2, melhor = null;
    [cx.z0, cx.z1].forEach(function (zl, k) {
      var p = Q.pt(xm, zl), d = distContorno(p, P), sg = k === 0 ? -1 : 1;
      if (!melhor || d < melhor.d) melhor = { zl: zl, d: d, dir: [Q.lz[0] * sg, Q.lz[1] * sg] };
    });
    return melhor;
  }
  function naParede(p, e) { return [p[0] + e.dir[0] * e.d, p[1] + e.dir[1] * e.d]; }

  function pedidos(ctx) {
    var out = { pedidos: [], pendencias: [], avisos: [] }, PD = PAD().mobiliario || {}, a = ctx.a, L = ctx.L, dentro = ctx.dentro, aval = ctx.aval;
    var fams = arr(ctx.estado && ctx.estado.familias);
    function doTipo(rg) { var t = a.tipo && a.tipo.id; return arr(rg.ambientes).indexOf(t) >= 0 || (!a.cls || !a.cls.casou ? arr(rg.ambientes).indexOf("generico") >= 0 : false); }
    function achar(rg) {
      return fams.filter(function (f) { return f && f.famId && arr(rg.quando && rg.quando.fam).indexOf(String(f.famId)) >= 0 && f.host == null && dentro([num(f.x, 0), num(f.z, 0)], a.pts) && L.pavDe(num(f.y, 0)) === a.pav; });
    }
    function caixaDe(f) {
      var av = null; try { av = typeof aval === "function" ? aval(f.famId, f.tipoId, f.inst || {}) : null; } catch (e) { av = null; }
      return av && av.caixa && isFinite(av.caixa.x0) && isFinite(av.caixa.z0) ? { cx: av.caixa, v: av.valores || {} } : null;
    }
    function novo(regra, f, origem, ancoras, h, alcance, nivel, fonte) {
      out.pedidos.push({ regra: regra, movel: String(f.id), origem: origem + " (" + f.id + ")", ancoras: ancoras, h: h, alcance: alcance, nivel: nivel, texto: origem + ": " + fonte });
    }

    /* ---- cama: tomadas de cabeceira ---- */
    var RC = PD.cama;
    if (RC && doTipo(RC)) achar(RC).forEach(function (f) {
      var c = caixaDe(f); if (!c) return;
      var Q = quadro(f), cx = c.cx, e = encosto(Q, cx, a.pts), xm = (cx.x0 + cx.x1) / 2, hw = (cx.x1 - cx.x0) / 2;
      var larg = num(c.v.Largura_colchao, hw * 2), casal = larg >= valor(RC, "casalMinimo_m") - 1e-9, rec = valor(RC, "recuoLateral_m"), h = valor(RC, "altura_m"), al = valor(RC, "alcance_m");
      if (e.d > al + 0.2) { out.avisos.push("\"" + a.nome + "\": a cama " + f.id + " não encosta numa parede (cabeceira a " + e.d.toFixed(2).replace(".", ",") + " m): as tomadas da cabeceira não foram lançadas."); return; }
      function lado(s) {
        var base = Q.pt(xm + s * (hw + rec), e.zl), cr = fams.filter(function (m) { return m && m.famId === "ra-mob-criado" && dist([num(m.x, 0), num(m.z, 0)], base) <= 0.5; })[0];
        var P0 = cr ? [num(cr.x, 0), num(cr.z, 0)] : base;
        return { s: s, P: naParede(P0, { dir: e.dir, d: distContorno(P0, a.pts) }), borda: distContorno(Q.pt(xm + s * hw, (cx.z0 + cx.z1) / 2), a.pts), criado: !!cr };
      }
      var la = lado(-1), lb = lado(1), fonte = (valor(RC, "altura_m") != null ? "altura " + h.toFixed(2).replace(".", ",") + " m (" + RC.altura_m.fonte + ")" : "");
      if (casal) {
        novo("cama", f, RC.origem + " (lado 1)", [la.P], h, al, RC.altura_m.nivel, "casal: uma tomada de cada lado — " + fonte);
        novo("cama", f, RC.origem + " (lado 2)", [lb.P], h, al, RC.altura_m.nivel, "casal: uma tomada de cada lado — " + fonte);
      } else {
        /* solteiro encostada numa parede lateral: a tomada vai para o lado LIVRE (a borda da cama mais longe da parede) */
        var livre = la.borda >= lb.borda ? [la, lb] : [lb, la];
        novo("cama", f, RC.origem, [livre[0].P, livre[1].P], h, al, RC.altura_m.nivel, "solteiro: uma tomada, do lado livre — " + fonte);
      }
    });

    /* ---- rack / painel de TV ---- */
    var RR = PD.rack;
    if (RR && doTipo(RR)) achar(RR).forEach(function (f) {
      var c = caixaDe(f); if (!c) return;
      var Q = quadro(f), cx = c.cx, e = encosto(Q, cx, a.pts), xm = (cx.x0 + cx.x1) / 2, al = valor(RR, "alcance_m");
      if (e.d > al + 0.2) { out.avisos.push("\"" + a.nome + "\": o rack " + f.id + " não encosta numa parede: as tomadas do rack não foram lançadas."); return; }
      arr(RR.pontos).forEach(function (pt) {
        novo("rack", f, pt.origem, [naParede(Q.pt(xm + pt.lateral_m, e.zl), e)], pt.altura_m, al, RR.nivel, "altura " + pt.altura_m.toFixed(2).replace(".", ",") + " m atrás do painel/rack (" + RR.fonte + ")");
      });
      out.pendencias.push({ ambiente: a.id, texto: "\"" + a.nome + "\": ponto de TV/dados do rack " + f.id + " — o modelo não tem família de ponto de dados: lance à mão." });
    });

    /* ---- sofá: uma tomada ao lado, na parede de encosto ---- */
    var RS = PD.sofa;
    if (RS && doTipo(RS)) achar(RS).forEach(function (f) {
      var c = caixaDe(f); if (!c) return;
      var Q = quadro(f), cx = c.cx, e = encosto(Q, cx, a.pts), al = valor(RS, "alcance_m"), rec = valor(RS, "recuoLateral_m");
      if (e.d > al) return;   /* sofá no meio da sala: sem parede de encosto, nada a pedir */
      var A = [naParede(Q.pt(cx.x1 + rec, e.zl), e), naParede(Q.pt(cx.x0 - rec, e.zl), e)];
      novo("sofa", f, RS.origem, A, valor(RS, "altura_m"), 0.6, RS.altura_m.nivel, "altura " + valor(RS, "altura_m").toFixed(2).replace(".", ",") + " m, " + RS.recuoLateral_m.fonte);
    });

    /* ---- escrivaninha ---- */
    var RE = PD.escrivaninha;
    if (RE && doTipo(RE)) achar(RE).forEach(function (f) {
      var c = caixaDe(f); if (!c) return;
      var Q = quadro(f), cx = c.cx, e = encosto(Q, cx, a.pts), xm = (cx.x0 + cx.x1) / 2, al = valor(RE, "alcance_m");
      if (e.d > al + 0.2) { out.avisos.push("\"" + a.nome + "\": a escrivaninha " + f.id + " não encosta numa parede: a tomada dela não foi lançada."); return; }
      novo("escrivaninha", f, RE.origem, [naParede(Q.pt(xm, e.zl), e), naParede(Q.pt(cx.x1 + 0.3, e.zl), e), naParede(Q.pt(cx.x0 - 0.3, e.zl), e)], valor(RE, "altura_m"), al, RE.altura_m.nivel, "altura " + valor(RE, "altura_m").toFixed(2).replace(".", ",") + " m (" + RE.altura_m.fonte + ")");
    });
    return out;
  }

  var EleMobiliario = { pedidos: pedidos, quadro: quadro, encosto: encosto };
  global.EleMobiliario = EleMobiliario;
  if (typeof module !== "undefined" && module.exports) module.exports = EleMobiliario;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

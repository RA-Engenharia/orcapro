/* =====================================================================
 * hidventgeo.js — o TERMINAL DE VENTILAÇÃO como o produto da ficha (motor PURO de geometria, ES5, Node-testável). 18/10/2026.
 *
 * Correção do Rogério na ventilação do "Traçar automaticamente": a coluna DN 50 sobe embutida no eixo da parede até a altura de
 * saída (padrão +3,50 m) e "lá em cima vai a tampinha" — o TERMINAL DE VENTILAÇÃO, com a volumetria do produto: ficha de esgoto
 * série normal (Amanco Wavin, p.25–26; Tigre equivalente 59502719/59502980/59502999 sem cotas no acervo), cotas geradas por
 * tools/gerar-hidgeo-dados.js em js/biminstgeodados.js (pecas.terminal_ventilacao): A = altura total, B = Ø do chapéu,
 * C = altura da bolsa (o tubo entra nela), E = Ø externo da bolsa. As aletas entre a bolsa e o chapéu não são cotadas: forma do
 * desenho (FORMA, hid:ok).
 *
 *   HidVentGeo.terminal(k, o) → { partes:[{papel, malha}], compra:[{codigo, descricao, qtd, obs}], cotas, fontes, aConferir } | null
 *     k = { x, y (o TOPO do tubo, dentro da bolsa), z, dn }
 *   HidVentGeo.dados(dn) → a linha da ficha (ou null: sem forma inventada)
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function G() { return dep("HidGeo", "./biminstgeo.js"); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  var MM = 0.001;   // hid:ok mm → m
  var FORMA = {
    chapeu: 6,        // hid:ok mm — espessura visual do chapéu
    passoAleta: 8,    // hid:ok mm — passo das aletas (desenho da ficha; não cotado)
    fracAleta: 0.92,  // hid:ok — a aleta um pouco menor que o chapéu (desenho)
    fracCorpo: 0.72,  // hid:ok — o miolo entre as aletas (desenho)
    lados: 24,        // hid:ok lados do polígono (perto)
    ladosLonge: 10    // hid:ok lados do polígono (longe)
  };
  function escala(p) { return p.map(function (x) { return [x[0] * MM, x[1] * MM]; }); }
  function tabela() { var d = dep("HidGeoDados", "./biminstgeodados.js"); return d && d.pecas ? d.pecas.terminal_ventilacao || null : null; }
  function dados(dn) { var t = tabela(); return t ? (t[String(dn)] || null) : null; }

  function terminal(k, o) {
    o = o || {};
    var H = G(), t = k ? dados(k.dn) : null; if (!H || !t) return null;
    var seg = o.lod === "longe" ? FORMA.ladosLonge : FORMA.lados, Y = [0, 1, 0];
    var base = [num(k.x, 0), num(k.y, 0) - t.altBolsa * MM, num(k.z, 0)], m = new H.Malha(), mc = new H.Malha();
    var rE = t.diamBolsa / 2, rB = t.diamChapeu / 2, topoAletas = t.alt - FORMA.chapeu, perfil = [[0, 0], [0, rE], [t.altBolsa, rE]];
    for (var y0 = t.altBolsa; y0 + FORMA.passoAleta <= topoAletas; y0 += FORMA.passoAleta) {
      perfil.push([y0, rB * FORMA.fracAleta], [y0 + FORMA.passoAleta / 2, rB * FORMA.fracAleta], [y0 + FORMA.passoAleta / 2, rE * FORMA.fracCorpo], [y0 + FORMA.passoAleta, rE * FORMA.fracCorpo]);
    }
    perfil.push([topoAletas, rE * FORMA.fracCorpo], [topoAletas, 0]);
    H.varrer(m, H.reta(base, Y), escala(perfil), seg, false);
    H.varrer(mc, H.reta([base[0], base[1] + topoAletas * MM, base[2]], Y), escala([[0, 0], [0, rB], [FORMA.chapeu, rB * FORMA.fracAleta], [FORMA.chapeu, 0]]), seg, false);
    var tg = (tabela().tigre || {})[String(k.dn)] || null;
    return { partes: [{ papel: "corpo", malha: m }, { papel: "corpo", malha: mc }], portas: [], avisos: [], aConferir: true,
             compra: [{ codigo: t.codigo, descricao: t.descricao, qtd: 1, obs: tg ? "Tigre equivalente " + tg + " (sem cotas no acervo)" : null }],
             cotas: { alt: t.alt, diamChapeu: t.diamChapeu, altBolsa: t.altBolsa, diamBolsa: t.diamBolsa },
             fontes: ["ficha de esgoto série normal (Amanco Wavin) p." + t.pag] };
  }

  var HidVentGeo = { VERSAO: 1, FORMA: FORMA, terminal: terminal, dados: dados };
  global.HidVentGeo = HidVentGeo;
  if (typeof module !== "undefined" && module.exports) module.exports = HidVentGeo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

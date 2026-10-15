/* =====================================================================
 * blocokdxf.js — DXF das PRANCHAS EXECUTIVAS do Blocok (motor puro, sem tela)
 *
 * BlocokDxf.gerar(resultado, opcoes) → { ok, arquivos:[{nome, texto}], avisos, dwg }
 *   Gera cada folha de BlocokPranchas.gerar (as mesmas primitivas do SVG) em DXF R2000 pelo
 *   js/bimdxf.js: BimDxf.daFolha desenha a moldura e o carimbo RA (as mesmas primitivas de
 *   js/prancha.js carimboRA — carimbo INTOCADO) e este módulo acrescenta o desenho, em MILÍMETROS DE
 *   PAPEL (o formato de cada folha: A3/A2/A1), com os layers EST-* e as penas do Padrão RA (+ BLK-* criados). Modelo de
 *   folha Blocok: as faixas e o cabeçalho das tabelas saem como hachura sólida nas camadas BLK-MARCA-* (cor ACI mais
 *   próxima do hex da marca; o DXF R2000 não leva cor verdadeira).
 *
 * ⚠ DWG NATIVO NÃO EXISTE no sistema (BimDxf.DWG.disponivel = false: o conversor de DWG exige licença
 *   comercial). O retorno diz isso (aviso + objeto dwg) — abrir o DXF no AutoCAD e Salvar como DWG.
 * ⚠ Cotas saem como linhas + texto nos layers EST-COTA (o desenho é o mesmo do SVG); não são DIMENSION
 *   associativas do AutoCAD.
 * Teste: node tools/test-blocokdxf.js
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./blocokpranchas.js"), require("./bimdxf.js"), require("./prancha.js"));
  else root.BlocokDxf = factory(root.BlocokPranchas, root.BimDxf, root.Prancha);
})(typeof self !== "undefined" ? self : this, function (BlocokPranchas, BimDxf, Prancha) {
  "use strict";

  function num(v, d) { var n = +v; return isFinite(n) ? n : (d == null ? 0 : d); }
  function txt(v) { return v == null ? "" : String(v); }
  function larg(s, h) { return txt(s).length * 0.86 * h; }

  /* polígono que aproxima um círculo cheio (hachura densa) */
  function polCirculo(x, y, r, n) { var p = [], i; for (i = 0; i < n; i++) p.push([x + r * Math.cos(2 * Math.PI * i / n), y + r * Math.sin(2 * Math.PI * i / n)]); return p; }

  function folhaParaDxf(f, op) {
    var g = f._geo, H = g.papel.h, L = BlocokPranchas.PADRAO.layers;
    var doc = BimDxf.daFolha(f._pr, f._folhaPr, g, {}, { empresa: op.empresa && typeof op.empresa === "object" ? op.empresa : null, logo: !!op.logo });
    /* penas e cores do padrão: especificar não cria a layer; ela entra no DXF só se alguma entidade usar */
    Object.keys(L).forEach(function (nome) { doc.especificar(nome, L[nome].pena, L[nome].lt || "CONTINUOUS", L[nome].aci); });
    function Y(y) { return H - y; }
    f.entidades.forEach(function (o) {
      var e, cam = o.c;
      if (o.t === "L") { e = doc.linha(cam, o.p[0], Y(o.p[1]), o.p[2], Y(o.p[3])); if (e && o.lt) e.lt = o.lt; }
      else if (o.t === "P") { e = doc.poli(cam, o.pts.map(function (p) { return [p[0], Y(p[1])]; }), o.f); if (e && o.lt) e.lt = o.lt; }
      else if (o.t === "C") {
        doc.circulo(cam, o.x, Y(o.y), o.r);
        if (o.cheio) { if (o.r >= 0.7) doc.hachura(cam, [polCirculo(o.x, Y(o.y), o.r, 12)], Math.max(0.12, o.r / 4)); else doc.circulo(cam, o.x, Y(o.y), o.r / 2); }
      } else if (o.t === "H") doc.hachura(cam, [o.pts.map(function (p) { return [p[0], Y(p[1])]; })], o.esp);
      else if (o.t === "F") doc.hachura(cam, [[[o.x, Y(o.y)], [o.x + o.w, Y(o.y)], [o.x + o.w, Y(o.y + o.h)], [o.x, Y(o.y + o.h)]]], 0, true);   /* faixa e cabeçalho do modelo Blocok: hachura sólida na camada da cor */
      else if (o.t === "T") {
        var w = o.w != null ? o.w : larg(o.s, o.h), x = o.x, y = o.y, centro = o.al === "C";
        if (!centro && o.al === "D") { if (o.ang) y = y + w; else x = x - w; }
        doc.texto(cam, x, Y(y), o.h * 0.7, o.s, o.ang ? 90 : 0, centro);
      }
    });
    return doc;
  }

  function gerar(resultado, opcoes) {
    var op = opcoes || {}, avisos = [];
    if (!BimDxf || !BimDxf.novoDoc) return { ok: false, arquivos: [], avisos: ["Motor de DXF (js/bimdxf.js) não carregado."] };
    var base = BlocokPranchas.gerar(resultado, op);
    if (!base.ok) return { ok: false, arquivos: [], avisos: base.avisos };
    /* BimDxf.daFolha lê o motor de pranchas pelo escopo global */
    var G = typeof global !== "undefined" ? global : (typeof self !== "undefined" ? self : this);
    if (G && !G.Prancha && Prancha) G.Prancha = Prancha;
    var arquivos = [];
    base.folhas.forEach(function (f) {
      var doc;
      try { doc = folhaParaDxf(f, op); } catch (e) { avisos.push("Folha " + f.numero + ": " + (e && e.message ? e.message : e)); return; }
      (doc.avisos || []).forEach(function (a) { avisos.push("Folha " + f.numero + ": " + a); });
      var nome = f.numero.replace(/[^A-Za-z0-9_-]+/g, "_") + "-" + f.id + ".dxf";
      arquivos.push({ nome: nome, texto: BimDxf.escrever(doc), folha: f.numero, titulo: f.titulo });
    });
    var dwg = BimDxf.DWG ? { disponivel: !!BimDxf.DWG.disponivel, motivo: txt(BimDxf.DWG.motivo) } : { disponivel: false, motivo: "" };
    if (!dwg.disponivel) avisos.push("DWG nativo indisponível no sistema: abrir o DXF no AutoCAD e Salvar como DWG. " + dwg.motivo);
    return { ok: arquivos.length > 0, arquivos: arquivos, avisos: base.avisos.concat(avisos), dwg: dwg, pranchas: base };
  }

  return { gerar: gerar, folhaParaDxf: folhaParaDxf };
});

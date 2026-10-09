/* =====================================================================
 * ifcp3.js — o IFC de SAÍDA do TELHADO, das BORDAS do telhado e da
 * FUNDAÇÃO (Fase P3, Frente D do plano do BIM). Motor puro.
 *
 * Quem chama é o js/ifcsaida.js (gancho "P3" no gerar), passando as
 * ferramentas do escritor dele (api): este arquivo só sabe COMO cada peça
 * da P3 vira IFC — o resto (cabeçalho, níveis, tipos, Psets do registro)
 * continua lá. As classes são as do arquivo de exportação do Revit
 * (exportlayers-ifc-IAI.txt) e da tabela do IMPORTADOR do Revit 2027
 * (revit-ifc, Source/Revit.IFC.Import/Utility/IFCCategoryUtil.cs, ramo
 * Release_27.x.x, lido em 09/10/2026):
 *   · TELHADO → IfcRoof (o conjunto, SEM corpo próprio) AGREGANDO um
 *     IfcSlab .ROOF. por água (IfcRelAggregates; cada água com o placement
 *     relativo ao do telhado) — o telhado vai por partes, uma laje por água.
 *     Importador: IfcRoof → OST_Roofs; (IfcSlab, ROOF) → OST_Roofs.
 *     Cada água é o polígono dela NO PLANO DA ÁGUA, extrudado na normal pela
 *     espessura do tipo (volume = área inclinada × espessura, a conta do motor).
 *   · CALHA → IfcPipeSegment .GUTTER. (Telhados/Calhas no arquivo de
 *     exportação; o importador leva IfcPipeSegment para Tubulação — ver
 *     a nota de limitações do importador de IFC); RUFO e TESTEIRA →
 *     IfcCovering .MOLDING. (Telhados/Bordas); INTRADORSO → IfcCovering
 *     .CLADDING. (Telhados/Intradorsos de telhado) — o importador não tem
 *     linha para MOLDING/CLADDING: Modelos genéricos.
 *   · SAPATA → IfcFooting .PAD_FOOTING.; BLOCO → IfcFooting .PILE_CAP. +
 *     um IfcPile .BORED. por estaca; ESTACA → IfcPile .BORED.; BALDRAME →
 *     IfcFooting .FOOTING_BEAM.; RADIER → IfcSlab .BASESLAB. (a linha do
 *     arquivo de exportação para Fundações estruturais). Importador:
 *     IfcFooting, IfcPile e (IfcSlab, BASESLAB) → OST_StructuralFoundation.
 * Psets/Qtos do registro (js/bimparam.js) entram pelo ifcsaida; aqui vão os
 * Qto de classe (Qto_SlabBaseQuantities, Qto_FootingBaseQuantities,
 * Qto_PileBaseQuantities) e o OrcaPRO_Origem.
 *
 * Teste: node tools/test-bimtelhado.js e node tools/test-bimfundacao.js
 * (IFC reaberto no web-ifc) e o teste do mapa de classes do IFC [7].
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1]; }

  /* IfcRoofTypeEnum pela forma do telhado */
  function tipoTelhado(t) {
    if (t.modo === "extrusao") return arr(t.aguasCalc).length === 2 ? "GABLE_ROOF" : (arr(t.aguasCalc).length === 1 ? "SHED_ROOF" : "FREEFORM");
    var ar = arr(t.arestasCalc), def = ar.filter(function (e) { return e.define; }).length, ag = arr(t.aguasCalc).length;
    if (!def) return "FLAT_ROOF";
    if (ag === 1) return "SHED_ROOF";
    if (def === ar.length && ar.length === 4) return "HIP_ROOF";
    if (ag === 2 && def === 2) return "GABLE_ROOF";
    return "FREEFORM";
  }

  var IfcP3 = {
    tipoTelhado: tipoTelhado,
    /* api = as ferramentas do js/ifcsaida.js gerar(): w, ref, S, E, L, R, G, OH, peca, placement, pos3,
       extrudado, perfilPoli, circulo, retangulo, forma, brepFaces, pintar, ligarMaterial, ligarCodigos,
       origemPset, pset, qto, nivelDaPeca, cena2ifc, avisos */
    escrever: function (api, st) {
      var A = api, out = { telhados: 0, aguas: 0, bordas: 0, fundacoes: 0, estacas: 0 };

      /* ================= TELHADO: IfcRoof + IfcSlab ROOF por água ================= */
      arr(st.telhados).forEach(function (t) {
        if (!t || t.id == null) return;
        if (!t.ok) { A.avisos.push("telhado " + t.id + ": " + (arr(t.avisos)[0] || "não fechou") + " — ficou de fora do IFC"); return; }
        var nv = A.nivelDaPeca(t, num(t.cotaApoio, 0)), plT = A.placement(nv.pl, [0, 0, 0]);
        var tp = t.tipoTelhado || {}, esp = num(t.espessura, 0), cam = arr(tp.camadas), matN = String((cam[0] && (cam[0].material || cam[0].rotulo)) || "Telha cerâmica");
        var tipoRef = String(tp.rotulo || "Telhado");
        var er = A.peca(t.id, "IFCROOF", "Telhado " + t.id, tipoRef, plT, null, [A.E(tipoTelhado(t))], num(t.cotaApoio, 0), nv, { mapa: "telhado" });
        A.ligarMaterial(er, matN);
        var partes = [], volTot = 0;
        arr(t.aguasCalc).forEach(function (ag, ia) {
          var pl = ag.plano;
          ag.pecas.forEach(function (pc, ip) {
            /* o plano da água no IFC: cena (x, y, z) → IFC (x, −z, y); y = a + bx·x + bz·z  →  Z = a + bx·X − bz·Y */
            /* X do perfil = a linha de maior declive da água (plana: o X do IFC) */
            var nrm = norm([-pl.bx, pl.bz, 1]), X = Math.abs(pl.bx) + Math.abs(pl.bz) < 1e-12 ? [1, 0, 0] : norm(cruz(nrm, cruz([0, 0, 1], nrm)));
            var Y = cruz(nrm, X), O = [0, 0, pl.a - nv.elevacao];
            var pts = pc.pts.map(function (q) { var P = [q.x, -q.z, q.y - nv.elevacao], d = sub(P, O); return [dot(d, X), dot(d, Y)]; });
            var chave = t.id + ":agua" + (ia + 1) + (ag.pecas.length > 1 ? "-" + (ip + 1) : "");
            var sol = A.extrudado(A.perfilPoli(pts, null, null, "telhado " + t.id + ", água " + (ia + 1)), A.pos3([0, 0, 0]), esp);
            A.pintar(sol, matN);
            var plA = A.placement(plT, O, nrm, X);
            var sl = A.peca(chave, "IFCSLAB", "Água " + (ia + 1) + " do telhado " + t.id, "Água " + String(ag.inclinacao).replace(".", ",") + " %", plA, A.forma([sol], "SweptSolid"), [A.E("ROOF")], num(t.cotaApoio, 0), nv, { parte: t.id, mapa: "aguaTelhado" });
            A.ligarMaterial(sl, matN);
            var areaI = Math.abs((function (P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; })(pts));
            A.qto(sl, "Qto_SlabBaseQuantities", [["Width", "L", esp], ["NetArea", "A", areaI], ["NetVolume", "V", areaI * esp]]);
            A.pset(sl, "Pset_SlabCommon", [["Reference", "IFCIDENTIFIER", "Água " + (ia + 1)]]);
            A.pset(sl, "OrcaPRO_AguaTelhado", [["Inclinacao", "IFCREAL", ag.inclinacao], ["Telhado", "IFCIDENTIFIER", String(t.id)]]);
            A.origemPset(sl, [["Telhado", "IFCIDENTIFIER", String(t.id)]]);
            sl.volume = r6(areaI * esp); sl.area = areaI; volTot += areaI * esp; partes.push(sl.ent); out.aguas++;
          });
        });
        A.w("IFCRELAGGREGATES", [A.G("rel:telhado:" + t.id), A.OH, "$", "$", A.ref(er.ent), A.L(partes.map(A.ref))]);
        A.pset(er, "Pset_RoofCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
        A.ligarCodigos(er, arr(t.servicos).map(function (s) { return s.codigo; })); A.origemPset(er, [["Modelador", "IFCLABEL", "P3"]]);
        er.volume = r6(volTot); er.partes = partes.length; er.semGeometriaPropria = true; out.telhados++;
      });

      /* ================= BORDAS: calha, rufo, testeira, intradorso ================= */
      var BT = A.dep ? A.dep("BimTelhado", "./bimtelhado.js") : null;
      arr(st.bordas).forEach(function (b) {
        if (!b || b.id == null) return;
        if (!b.ok) { A.avisos.push("borda " + b.id + ": " + (arr(b.avisos)[0] || "sem comprimento") + " — ficou de fora do IFC"); return; }
        var nv = A.nivelDaPeca({ nivelId: b.telhadoNivelId }, 0), pl = A.placement(nv.pl, [0, 0, 0]), itens = [];
        var info = BT && BT.BORDAS[b.tipoBorda] ? BT.BORDAS[b.tipoBorda] : { rotulo: "Borda", ifc: b.ifc, pre: b.ifcPre };
        var mat = b.tipoBorda === "intradorso" ? "Forro do beiral" : "Chapa metálica";
        var lg = num(b.larguraEf, 0.1), al = num(b.alturaEf, 0.1);
        if (b.tipoBorda === "intradorso") {
          arr(b.placas).forEach(function (pq) {
            var pts = pq.pts.map(function (q) { return [q.x, -q.z]; });
            var s = A.extrudado(A.perfilPoli(pts, null, null, "intradorso " + b.id), A.pos3([0, 0, num(pq.y, 0) - nv.elevacao - lg]), lg);
            A.pintar(s, mat); itens.push(s);
          });
        } else {
          arr(b.segs).forEach(function (sg) {
            var a = [sg.a.x, -sg.a.z, sg.a.y - nv.elevacao], c = [sg.b.x, -sg.b.z, sg.b.y - nv.elevacao], d = sub(c, a), Ls = Math.sqrt(dot(d, d));
            if (!(Ls > 1e-6)) return;
            var Z = norm(d), Xh = norm(cruz([0, 0, 1], Z)); if (Math.abs(Z[2]) > 0.999) Xh = [1, 0, 0];
            /* o perfil (largura × altura) centrado na linha, pendurado meia altura abaixo dela */
            var o = [a[0], a[1], a[2] - al / 2];
            var s = A.extrudado(A.retangulo(lg, al), A.pos3(o, Z, Xh), Ls);
            A.pintar(s, mat); itens.push(s);
          });
        }
        if (!itens.length) { A.avisos.push("borda " + b.id + ": sem trecho para desenhar — ficou de fora do IFC"); return; }
        var mapa = b.tipoBorda === "calha" ? "calha" : (b.tipoBorda === "intradorso" ? "intradorso" : "bordaTelhado");
        var tipoRef = info.rotulo + " " + Math.round(lg * 100) + " × " + Math.round(al * 100) + " cm";
        var el = A.peca(b.id, info.ifc, info.rotulo + " " + b.id, tipoRef, pl, A.forma(itens, "SweptSolid"), [A.E(info.pre)], 0, nv, { mapa: mapa });
        A.ligarMaterial(el, mat);
        if (info.ifc === "IFCPIPESEGMENT") A.qto(el, "Qto_PipeSegmentBaseQuantities", [["Length", "L", b.comprimento]]);
        else A.qto(el, "Qto_CoveringBaseQuantities", [["Width", "L", lg], ["NetArea", "A", b.area]]);
        A.pset(el, "OrcaPRO_Borda", [["Tipo", "IFCLABEL", info.rotulo], ["Telhado", "IFCIDENTIFIER", String(b.telhado)]]);
        A.ligarCodigos(el, arr(b.servicos).map(function (s) { return s.codigo; })); A.origemPset(el, [["Modelador", "IFCLABEL", "P3"]]);
        el.comprimento = b.comprimento; out.bordas++;
      });

      /* ================= FUNDAÇÃO ================= */
      var MAPA_F = { sapata: "sapata", bloco: "bloco", estaca: "estaca", baldrame: "baldrame", radier: "radier" };
      arr(st.fundacoes).forEach(function (f) {
        if (!f || f.id == null) return;
        if (!f.ok) { A.avisos.push("fundação " + f.id + ": " + (arr(f.avisos)[0] || "medidas inválidas") + " — ficou de fora do IFC"); return; }
        var nv = A.nivelDaPeca(f, num(f.cotaTopo, 0)), pl = A.placement(nv.pl, [0, 0, 0]), mat = "Concreto armado", itens = [], rep = "SweptSolid";
        var z0 = num(f.cotaFundo, 0) - nv.elevacao, H = num(f.cotaTopo, 0) - num(f.cotaFundo, 0);
        var P = arr(f.planta).map(function (q) { return [q.x, -q.z]; });
        if (f.tipoFundacao === "estaca") {
          var s0 = A.extrudado(A.circulo(num(f.diametroEf, 0) / 2), A.pos3([num(f.x, 0), -num(f.z, 0), z0]), H);
          A.pintar(s0, mat); itens.push(s0);
        } else if (f.tipoFundacao === "sapata" && f.chanfrada) {
          /* rodapé reto + tronco de pirâmide: um sólido de faces planas (IfcFacetedBrep) */
          var g = num(f.giro, 0) * Math.PI / 180, cu = Math.cos(g), su = Math.sin(g), cx = num(f.x, 0), cz = num(f.z, 0);
          var Bh = num(f.largura, 0) / 2, Lh = num(f.comprimento, 0) / 2, bh = num(f.larguraTopoEf, 0) / 2, lh = num(f.comprimentoTopoEf, 0) / 2, zr = z0 + num(f.alturaBaseEf, 0), zt = z0 + H;
          var cant = function (u, w2, zz) { var x = cx + u * cu - w2 * su, z = cz + u * su + w2 * cu; return [x, -z, zz]; };
          var sinal = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
          var Bk = sinal.map(function (s) { return cant(s[0] * Bh, s[1] * Lh, z0); }), Rk = sinal.map(function (s) { return cant(s[0] * Bh, s[1] * Lh, zr); }), Tk = sinal.map(function (s) { return cant(s[0] * bh, s[1] * lh, zt); });
          /* anti-horário visto de cima (+Z do IFC): cena (u, w) gira em −y do IFC — confere pela área */
          var ar2 = 0; for (var i = 0; i < 4; i++) { var a = Bk[i], b2 = Bk[(i + 1) % 4]; ar2 += a[0] * b2[1] - b2[0] * a[1]; }
          if (ar2 < 0) { Bk.reverse(); Rk.reverse(); Tk.reverse(); }
          var faces = [Bk.slice().reverse(), Tk.slice()];
          for (var k = 0; k < 4; k++) { var j = (k + 1) % 4; faces.push([Bk[k], Bk[j], Rk[j], Rk[k]]); faces.push([Rk[k], Rk[j], Tk[j], Tk[k]]); }
          var br = A.brepFaces(faces);
          if (br) { A.pintar(br, mat); itens.push(br); rep = "Brep"; }
        } else if (P.length >= 3) {
          var s1 = A.extrudado(A.perfilPoli(P, null, null, "fundação " + f.id), A.pos3([0, 0, z0]), H);
          A.pintar(s1, mat); itens.push(s1);
        }
        if (!itens.length) { A.avisos.push("fundação " + f.id + ": sem geometria — ficou de fora do IFC"); return; }
        var T = f.tipoFundacao, ent = f.ifc, tipoRef = String(f.rotuloTipo || "Fundação");
        var extra = ent === "IFCPILE" ? [A.E(f.ifcPre), "$"] : [A.E(f.ifcPre)];
        var el = A.peca(f.id, ent, tipoRef + " " + f.id, tipoRef, pl, A.forma(itens, rep), extra, num(f.cotaTopo, 0), nv, { mapa: MAPA_F[T] });
        A.ligarMaterial(el, mat);
        if (ent === "IFCPILE") A.qto(el, "Qto_PileBaseQuantities", [["Length", "L", H], ["CrossSectionArea", "A", f.areaBase], ["NetVolume", "V", f.volume]]);
        else if (ent === "IFCSLAB") A.qto(el, "Qto_SlabBaseQuantities", [["Width", "L", H], ["NetArea", "A", f.areaBase], ["Perimeter", "L", f.perimetro], ["NetVolume", "V", f.volume]]);
        else A.qto(el, "Qto_FootingBaseQuantities", [["Length", "L", T === "baldrame" ? f.comprimentoPeca : num(f.comprimento, 0)], ["Width", "L", num(f.largura, 0)], ["Height", "L", H], ["NetVolume", "V", f.volume], ["GrossVolume", "V", f.volume]]);
        A.pset(el, ent === "IFCPILE" ? "Pset_PileCommon" : (ent === "IFCSLAB" ? "Pset_SlabCommon" : "Pset_FootingCommon"), [["Reference", "IFCIDENTIFIER", tipoRef], ["LoadBearing", "IFCBOOLEAN", true]]);
        A.ligarCodigos(el, arr(f.servicos).map(function (s) { return s.codigo; })); A.origemPset(el, [["Modelador", "IFCLABEL", "P3"]]);
        el.volume = r6(f.volume); out.fundacoes++;
        /* BLOCO: as estacas, IfcPile .BORED., da ponta ao fundo do bloco */
        if (T === "bloco") {
          var Le = num(f.comprimentoEstacaEf, 0), zp = num(f.cotaPontaEstacas, 0) - nv.elevacao, rEst = num(f.diametroEf, 0) / 2;
          arr(f.estacas).forEach(function (e, ie) {
            var se = A.extrudado(A.circulo(rEst), A.pos3([e.x, -e.z, zp]), Le);
            A.pintar(se, mat);
            var ch = f.id + ":estaca" + (ie + 1);
            var ep = A.peca(ch, "IFCPILE", "Estaca " + (ie + 1) + " do bloco " + f.id, "Estaca Ø " + Math.round(rEst * 200) + " cm", A.placement(nv.pl, [0, 0, 0]), A.forma([se], "SweptSolid"), [A.E("BORED"), "$"], num(f.cotaFundo, 0), nv, { mapa: "estaca" });
            A.ligarMaterial(ep, mat);
            var aE = Math.PI * rEst * rEst;
            A.qto(ep, "Qto_PileBaseQuantities", [["Length", "L", Le], ["CrossSectionArea", "A", aE], ["NetVolume", "V", aE * Le]]);
            A.pset(ep, "Pset_PileCommon", [["Reference", "IFCIDENTIFIER", "Estaca do bloco " + f.id], ["LoadBearing", "IFCBOOLEAN", true]]);
            A.origemPset(ep, [["Bloco", "IFCIDENTIFIER", String(f.id)]]);
            ep.volume = r6(aE * Le); out.estacas++;
          });
        }
      });
      return out;
    }
  };

  global.IfcP3 = IfcP3;
  if (typeof module !== "undefined" && module.exports) module.exports = IfcP3;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

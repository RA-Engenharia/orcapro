/* =====================================================================
 * madengexport.js — SKETCHUP e CYPE 3D da madeira engenharada (E3). Motor PURO, ES5, sem DOM, Node-testável.
 *  · gerarDae: COLLADA (.dae) — o SketchUp importa .dae; o sistema NÃO gera .skp. Um nó por FAMÍLIA (grupo da fonte), malha de triângulos, metros, cena Y para cima.
 *  · pacoteCype: geometria por etiqueta (NUDOS/BARRAS, latin-1, CRLF — o formato que o CYPE 3D importa), série/material e ROTEIRO.
 * Reaproveita MadEngSaidas.corpoPeca (a mesma receita de extrusão do IFC).
 * Teste: node tools/test-mad-eng-export.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  function SA() { return dep("MadEngSaidas", "./madengsaidas.js"); }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function br(v, c) { return SA().br(v, c); }
  function x(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var CORES = ["0.00 0.25 0.42", "0.44 0.37 0.28", "0.25 0.47 0.09", "0.66 0.60 0.41", "0.60 0.60 0.65", "0.75 0.35 0.20", "0.30 0.50 0.70", "0.55 0.40 0.60"];

  function malha(c, tri, pts) {
    var r = c.receita, pl = r.plano, o = pl.o, u = pl.u, v = pl.v, nv = cruz(u, v), H = r.altura, K = r.contorno.length, base = pts.length / 3, i;
    function P(q, h) { return [o[0] + u[0] * q[0] + v[0] * q[1] + nv[0] * h, o[1] + u[1] * q[0] + v[1] * q[1] + nv[1] * h, o[2] + u[2] * q[0] + v[2] * q[1] + nv[2] * h]; }
    var cx = 0, cy = 0; r.contorno.forEach(function (q) { cx += q[0]; cy += q[1]; }); cx /= K; cy /= K;
    r.contorno.forEach(function (q) { var a = P(q, 0); pts.push(a[0], a[1], a[2]); });
    r.contorno.forEach(function (q) { var a = P(q, H); pts.push(a[0], a[1], a[2]); });
    var c0 = P([cx, cy], 0), c1 = P([cx, cy], H); pts.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2]);
    var C0 = base + 2 * K, C1 = C0 + 1;
    for (i = 0; i < K; i++) { var j = (i + 1) % K; tri.push(C0, base + j, base + i, C1, base + K + i, base + K + j, base + i, base + j, base + K + j, base + i, base + K + j, base + K + i); }
  }
  function gerarDae(pecas, opts) {
    opts = opts || {};
    var por = {}, ordem = [];
    (pecas || []).forEach(function (p) { var c = SA().corpoPeca(p); if (!c) return; (por[p.grupo] = por[p.grupo] || { itens: [] }).itens.push({ p: p, c: c }); if (ordem.indexOf(p.grupo) < 0) ordem.push(p.grupo); });
    if (!ordem.length) return { ok: false, erro: "não há peça com corpo para exportar" };
    var geo = [], mat = [], eff = [], nos = [], nTri = 0;
    ordem.forEach(function (g, gi) {
      var pts = [], tri = []; por[g].itens.forEach(function (it) { malha(it.c, tri, pts); });
      var id = "g" + gi, nome = x(g), ps = pts.map(function (v) { return Math.round(v * 10000) / 10000; }); nTri += tri.length / 3;
      geo.push('<geometry id="' + id + '" name="' + nome + '"><mesh><source id="' + id + '-p"><float_array id="' + id + '-pa" count="' + ps.length + '">' + ps.join(" ") + '</float_array><technique_common><accessor source="#' + id + '-pa" count="' + ps.length / 3 + '" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><vertices id="' + id + '-v"><input semantic="POSITION" source="#' + id + '-p"/></vertices><triangles material="m' + gi + '" count="' + tri.length / 3 + '"><input semantic="VERTEX" source="#' + id + '-v" offset="0"/><p>' + tri.join(" ") + "</p></triangles></mesh></geometry>");
      eff.push('<effect id="e' + gi + '"><profile_COMMON><technique sid="t"><lambert><diffuse><color>' + CORES[gi % CORES.length] + ' 1</color></diffuse></lambert></technique></profile_COMMON></effect>');
      mat.push('<material id="m' + gi + '" name="' + nome + '"><instance_effect url="#e' + gi + '"/></material>');
      nos.push('<node id="n' + gi + '" name="' + nome + ' (' + por[g].itens.length + ' peças)"><instance_geometry url="#' + id + '"><bind_material><technique_common><instance_material symbol="m' + gi + '" target="#m' + gi + '"/></technique_common></bind_material></instance_geometry></node>');
    });
    var texto = '<?xml version="1.0" encoding="utf-8"?>\n<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><contributor><authoring_tool>OrçaPRO — Estruturas de madeira</authoring_tool></contributor><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>' +
      "<library_effects>" + eff.join("") + "</library_effects><library_materials>" + mat.join("") + "</library_materials><library_geometries>" + geo.join("") + '</library_geometries><library_visual_scenes><visual_scene id="cena" name="' + x(opts.projeto || "Estrutura de madeira") + '">' + nos.join("") + '</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#cena"/></scene></COLLADA>\n';
    return { ok: true, texto: texto, grupos: ordem.length, pecas: ordem.reduce(function (s, g) { return s + por[g].itens.length; }, 0), triangulos: nTri, nomesGrupos: ordem };
  }

  var ETIQ = [[/^T\d/, "TERCAS"], [/^V\d/, "VIGAS_V"], [/^P\d/, "PILARES"], [/^ES\d/, "ESCORAS"], [/^BL/, "BLOQUEADORES"], [/^VG/, "VERGAS"], [/^TR/, "TRAVESSAS"], [/^PD/, "PENDURAIS"]];
  function pacoteCype(res, opts) {
    opts = opts || {};
    var pecas = (res && res.fonte && res.fonte.pecas) || [], arqs = {}, series = [], nos = {}, lista = [], avisos = [];
    var pil = pecas.filter(function (p) { return /^P\d/.test(p.id) && p.p0; });
    if (!pil.length) return { ok: false, erro: "a fonte não tem pilares: sem referência de origem para o CYPE" };
    var X0 = Math.min.apply(null, pil.map(function (p) { return p.p0[0]; })), Y0 = Math.min.apply(null, pil.map(function (p) { return p.p0[1]; })), cont = 0;
    function noDe(P) { var k = [Math.round((P[0] - X0) * 1000), Math.round((P[1] - Y0) * 1000), Math.round(P[2] * 1000)].join("|"); if (!nos[k]) { nos[k] = { id: ++cont, c: [P[0] - X0, P[1] - Y0, P[2]] }; lista.push(nos[k]); } return nos[k].id; }
    ETIQ.forEach(function (e) {
      var bs = pecas.filter(function (p) { return e[0].test(p.id) && p.p0 && p.p1 && p.secao; });
      if (!bs.length) return;
      var ids = {}, barras = bs.map(function (p) { var a = noDe(p.p0), b = noDe(p.p1); ids[a] = 1; ids[b] = 1; return p.id.replace(/[^\w]/g, "_") + " " + a + " " + b; });
      var ns = Object.keys(ids).map(Number).sort(function (a, b) { return a - b; }), byId = {}; lista.forEach(function (n) { byId[n.id] = n; });
      var linhas = ["NUDOS"]; ns.forEach(function (i) { var c = byId[i].c; linhas.push(i + " X=" + c[0].toFixed(4) + " Y=" + c[1].toFixed(4) + " Z=" + c[2].toFixed(4)); });
      linhas.push("BARRAS"); barras.forEach(function (b) { linhas.push(b); });
      arqs["c3d_" + e[1] + ".txt"] = { texto: linhas.join("\r\n") + "\r\n", latin1: true };
      var s0 = bs[0].secao; series.push([e[1], bs.length, s0.tipo === "circ" ? "D" + Math.round(s0.d * 100) : s0.tipo === "perfil" ? Math.round(s0.b * 100) + "x variavel" : Math.round(s0.b * 100) + "x" + Math.round(s0.h * 100)]);
    });
    arqs["series_materiais.csv"] = { texto: ["etiqueta;barras;secao_cm;material_no_CYPE;classe_no_sistema"].concat(series.map(function (r) { return r.join(";") + ";MLC GL24h - escolher a madeira equivalente no CYPE (nomenclatura NBR 7190:1997) e conferir;GL24h (EN 14080)"; })).join("\r\n") + "\r\n", latin1: true };
    var R = res.reacoes || {}, rl = Object.keys(R).sort().map(function (k) { var q = R[k]; return "- " + k + ": N máx " + br(q.Nmax, 1) + " kN · N mín " + br(q.Nmin, 1) + " kN · H máx " + br(q.Hmax, 1) + " kN · M máx " + br(q.Mmax, 1) + " kN·m"; });
    var rot = ["# Roteiro — " + ((opts.obra && opts.obra.nome) || "obra") + " (madeira engenharada) no CYPE 3D", "",
      "Recurso exclusivo: reservar o CYPE na RA-Central (`travar`) antes e `destravar` depois (skill cype-motor).", "",
      "## 1. Geometria", "- Origem no pé do pilar de menor X e Y; Z = cota. Unidades m / kN.", "- Geometria → Importar → Ficheiro de texto, um arquivo por etiqueta: " + Object.keys(arqs).filter(function (k) { return /^c3d_/.test(k); }).join(", ") + " (latin-1, CRLF; nós repetidos se fundem pela coordenada).",
      "- " + lista.length + " nós. A viga V de altura variável entra como UMA barra pelo eixo: lançar a seção variável à mão (perfil no memorial e na folha E04).", "",
      "## 2. Séries e materiais", "- Ver `series_materiais.csv`: o CYPE usa a nomenclatura da NBR 7190:1997; o sistema verifica pela 7190-1:2022 — diferença de η é esperada.", "",
      "## 3. Apoios e liberações", "- Pilares engastados na base com mola de rotação (rigidez do memorial); topo do pilar rotulado na V; escoras e bloqueadores rotulados nas pontas; fita só tração.", "",
      "## 4. Cargas", "- Peso próprio pelo CYPE; telha, lambri, sobrecarga e vento (ortogonal, oblíquo, beiral, abertura dominante): valores e combinações no memorial (seções 2 a 4). Lançar por hipótese.", "",
      "## 5. Depois de calcular", "- Comparar as reações na base com o sistema (esperado até 10 %):", rl.join("\n")];
    arqs["ROTEIRO_CYPE.md"] = { texto: rot.join("\n"), latin1: false };
    if (!series.length) avisos.push("nenhuma barra estrutural na fonte");
    return { ok: true, arquivos: arqs, series: series, nos: lista.length, avisos: avisos };
  }
  var MadEngExport = { gerarDae: gerarDae, pacoteCype: pacoteCype };
  global.MadEngExport = MadEngExport;
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngExport;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

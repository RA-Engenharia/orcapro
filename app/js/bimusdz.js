/* =====================================================================
 * bimusdz.js — o projeto em RA no iPhone, sem aplicativo (AR Quick Look)
 *
 * ⚠ POR QUE ISTO EXISTE (29/09/2026): o Safari não tem WebXR. No iPhone o
 *   visor só oferecia "Caminhar" e a "Câmera + Projeto" (giroscópio sobre a
 *   imagem da câmera, sem âncora — o projeto escorrega quando a pessoa
 *   anda). A RA que FIXA no chão, no iPhone, é a do próprio sistema: o AR
 *   Quick Look, que abre um arquivo .usdz a partir de um link <a rel="ar">.
 *   Nada é instalado e nada sai do aparelho — o arquivo é montado aqui, a
 *   partir do que já está na cena.
 *
 * Motor puro (sem THREE, sem DOM): recebe as peças já com a matriz de cada
 * uma e devolve os bytes do .usdz. A fiação fica em js/bim.js.
 *
 *   BimUsdz.gerar(pecas, opts) -> { ok, bytes, tri, malhas, escala, erro }
 *     pecas: [{ cor:[r,g,b,a] (0..1, sRGB), pos, nor, idx, matriz(16, coluna) }]
 *     opts.modo: "real" (1:1, para a obra) | "maquete" (cabe na mesa)
 *   BimUsdz.quickLook(ambiente) -> true/false (o aparelho abre .usdz em RA?)
 *
 * ⚠ TRÊS REGRAS DO FORMATO que o Quick Look cobra em silêncio — o arquivo
 *   errado não dá erro, simplesmente não abre:
 *   1. ZIP SEM COMPRESSÃO, e o primeiro arquivo tem de ser o .usda;
 *   2. os DADOS de cada arquivo começam em múltiplo de 64 bytes (o campo
 *      "extra" do cabeçalho local serve de enchimento);
 *   3. cor em espaço LINEAR — o IFC traz a cor como se vê na tela (sRGB), e
 *      sem converter tudo sai desbotado.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ TETO DE TRIÂNGULOS. O .usda é texto: 500 mil triângulos viram ~60 MB
     de string montada NO CELULAR, e o Safari do iPhone derruba a aba perto de
     1 GB de memória — com o modelo, o web-ifc e a cena já ocupando espaço.
     Acima do teto o motor recusa e diz o número; a tela oferece o Caminhar,
     que segura modelos bem maiores. */
  var LIMITE_TRI = 500000;
  var MAQUETE_M = 0.8; // maior lado da maquete na mesa, em metros

  // ---------- números: curtos, porque cada caractere vira byte no celular ----------
  function n(v, casas) {
    var t = v.toFixed(casas);
    if (t.indexOf(".") > -1) {
      var fim = t.length;
      while (fim > 0 && t.charCodeAt(fim - 1) === 48) fim--; // zeros à direita
      if (t.charCodeAt(fim - 1) === 46) fim--;               // ponto solto
      t = t.slice(0, fim);
    }
    return (t === "-0") ? "0" : t;
  }
  function linear(c) { // sRGB -> linear (regra 3)
    c = Math.max(0, Math.min(1, +c || 0));
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  // ---------- matriz 4x4 em ordem de coluna (a do three.js) ----------
  function aplicarPonto(m, x, y, z, out, o) {
    out[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  /* A normal NÃO se transforma pela mesma matriz quando a escala não é
     uniforme: é a inversa-transposta da 3x3. IFC com peça espelhada ou
     esticada existe (família espelhada no Revit). */
  function matrizNormal(m) {
    var a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    var det = a * A + b * B + c * C;
    if (!det) return { n: [1, 0, 0, 0, 1, 0, 0, 0, 1], det: 0 };
    var D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
    var G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
    /* inversa-transposta = cofatores / det, já na ordem "linha" usada abaixo */
    return { n: [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det], det: det };
  }

  // ---------- CRC32 + ZIP de um arquivo só, alinhado em 64 (regras 1 e 2) ----------
  var TAB = null;
  function crc32(bytes) {
    if (!TAB) {
      TAB = new Array(256);
      for (var k = 0; k < 256; k++) { var c = k; for (var j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); TAB[k] = c >>> 0; }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = TAB[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipUsdz(nome, dados) {
    var nomeB = asciiBytes(nome), crc = crc32(dados);
    var semExtra = 30 + nomeB.length;
    var extra = (64 - (semExtra % 64)) % 64;
    if (extra > 0 && extra < 4) extra += 64; // o campo extra tem 4 bytes de cabeçalho
    var inicioDados = semExtra + extra;       // múltiplo de 64
    var central = 46 + nomeB.length, fimCentral = 22;
    var total = inicioDados + dados.length + central + fimCentral;
    var out = new Uint8Array(total), dv = new DataView(out.buffer), p = 0;
    function u16(v) { dv.setUint16(p, v, true); p += 2; }
    function u32(v) { dv.setUint32(p, v >>> 0, true); p += 4; }
    // cabeçalho local
    u32(0x04034b50); u16(10); u16(0); u16(0); u16(0); u16(0x21);
    u32(crc); u32(dados.length); u32(dados.length); u16(nomeB.length); u16(extra);
    out.set(nomeB, p); p += nomeB.length;
    if (extra) { u16(0x3039); u16(extra - 4); p += extra - 4; } // enchimento zerado
    out.set(dados, p); p += dados.length;
    // diretório central
    var ofCentral = p;
    u32(0x02014b50); u16(20); u16(10); u16(0); u16(0); u16(0); u16(0x21);
    u32(crc); u32(dados.length); u32(dados.length); u16(nomeB.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(0);
    out.set(nomeB, p); p += nomeB.length;
    // fim do diretório
    u32(0x06054b50); u16(0); u16(0); u16(1); u16(1); u32(central); u32(ofCentral); u16(0);
    return out;
  }
  function asciiBytes(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
    return b;
  }

  // ---------- preparação comum (.usdz e .glb) ----------
  /* ⚠ DUAS PASSADAS, EM DUPLA PRECISÃO ATÉ RECENTRAR. A primeira versão
     guardava as coordenadas do MUNDO em Float32 antes de recentrar — num IFC
     georreferenciado (UTM, ~7 460 000 m) o Float32 só tem resolução de 0,5 m,
     e a peça saía deslocada ou achatada. O teste com o cubo passava por sorte
     (meio metro exato). Agora a 1ª passada só mede a caixa; a 2ª transforma
     de novo e grava JÁ recentrado, onde o Float32 sobra. */
  function preparar(pecas, opts) {
    opts = opts || {};
    var limite = opts.limiteTri || LIMITE_TRI;
    pecas = (pecas || []).filter(function (p) { return p && p.pos && p.pos.length >= 9 && p.idx && p.idx.length >= 3; });
    if (!pecas.length) return { ok: false, erro: "vazio", tri: 0 };
    var tri = 0, i, j;
    for (i = 0; i < pecas.length; i++) tri += Math.floor(pecas[i].idx.length / 3);
    if (tri > limite) return { ok: false, erro: "grande", tri: tri, limite: limite };

    var ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], tmp = [0, 0, 0];
    for (i = 0; i < pecas.length; i++) {
      var m1 = pecas[i].matriz || ID, pp = pecas[i].pos, nv1 = Math.floor(pp.length / 3);
      for (j = 0; j < nv1; j++) {
        aplicarPonto(m1, pp[j * 3], pp[j * 3 + 1], pp[j * 3 + 2], tmp, 0);
        for (var e = 0; e < 3; e++) { if (tmp[e] < min[e]) min[e] = tmp[e]; if (tmp[e] > max[e]) max[e] = tmp[e]; }
      }
    }
    /* O Quick Look e o Scene Viewer põem a ORIGEM do arquivo no chão que
       acharam. Então a base do projeto vai para y=0 e o centro em planta para
       x=z=0 — sem isto um IFC georreferenciado aparece a quilômetros da
       pessoa, ou enterrado. */
    var cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2, y0 = min[1];
    var lado = Math.max(max[0] - min[0], max[2] - min[2]) || 1;
    var escala = opts.modo === "maquete" ? MAQUETE_M / lado : 1;

    // agrupa por cor: centenas de malhas pesam no Quick Look; dezenas não
    var porCor = {}, ordem = [];
    for (i = 0; i < pecas.length; i++) {
      var c = pecas[i].cor || [0.8, 0.8, 0.8, 1], a = c[3] == null ? 1 : c[3];
      var k = n(c[0], 2) + "|" + n(c[1], 2) + "|" + n(c[2], 2) + "|" + n(a, 2);
      if (!porCor[k]) { porCor[k] = { cor: [c[0], c[1], c[2], a], itens: [], nv: 0, ni: 0 }; ordem.push(k); }
      porCor[k].itens.push(pecas[i]);
      porCor[k].nv += Math.floor(pecas[i].pos.length / 3);
      porCor[k].ni += Math.floor(pecas[i].idx.length / 3) * 3;
    }
    var grupos = ordem.map(function (k) {
      var g = porCor[k], pos = new Float32Array(g.nv * 3), nor = new Float32Array(g.nv * 3), idx = new Uint32Array(g.ni);
      var vb = 0, ib = 0;
      g.itens.forEach(function (p) {
        var m = p.matriz || ID, nv = Math.floor(p.pos.length / 3), mn = matrizNormal(m), N = mn.n;
        for (var v = 0; v < nv; v++) {
          aplicarPonto(m, p.pos[v * 3], p.pos[v * 3 + 1], p.pos[v * 3 + 2], tmp, 0);
          var o = (vb + v) * 3;
          pos[o] = (tmp[0] - cx) * escala; pos[o + 1] = (tmp[1] - y0) * escala; pos[o + 2] = (tmp[2] - cz) * escala;
          if (p.nor && p.nor.length >= nv * 3) {
            var x = p.nor[v * 3], y = p.nor[v * 3 + 1], z = p.nor[v * 3 + 2];
            var nx = N[0] * x + N[1] * y + N[2] * z, ny = N[3] * x + N[4] * y + N[5] * z, nz = N[6] * x + N[7] * y + N[8] * z;
            var l = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (l > 1e-12) { nor[o] = nx / l; nor[o + 1] = ny / l; nor[o + 2] = nz / l; } else nor[o + 1] = 1;
          } else nor[o + 1] = 1;
        }
        /* ⚠ PEÇA ESPELHADA (det < 0) inverte o sentido dos triângulos: sem
           desvirar, a face de fora vira a de dentro e a peça some no Quick
           Look, que desenha um lado só. */
        var esp = mn.det < 0, q = Math.floor(p.idx.length / 3) * 3;
        for (var t = 0; t < q; t += 3) {
          idx[ib + t] = p.idx[t] + vb;
          idx[ib + t + 1] = (esp ? p.idx[t + 2] : p.idx[t + 1]) + vb;
          idx[ib + t + 2] = (esp ? p.idx[t + 1] : p.idx[t + 2]) + vb;
        }
        vb += nv; ib += q;
      });
      return { cor: g.cor, pos: pos, nor: nor, idx: idx };
    });
    return {
      ok: true, grupos: grupos, tri: tri, escala: escala, casas: escala < 0.2 ? 5 : 4,
      tamanho: { x: (max[0] - min[0]) * escala, y: (max[1] - min[1]) * escala, z: (max[2] - min[2]) * escala }
    };
  }

  // ---------- .usdz (iPhone, AR Quick Look) ----------
  function gerar(pecas, opts) {
    var pr = preparar(pecas, opts);
    if (!pr.ok) return pr;
    var casas = pr.casas, partes = [], materiais = [];
    partes.push('#usda 1.0\n(\n    customLayerData = {\n        string creator = "OrcaPRO"\n    }\n    defaultPrim = "Root"\n    metersPerUnit = 1\n    upAxis = "Y"\n)\n\n');
    partes.push('def Xform "Root"\n{\n    def Scope "Scenes" (\n        kind = "sceneLibrary"\n    )\n    {\n        def Xform "Scene" (\n            customData = {\n                bool preliminary_collidesWithEnvironment = 0\n                string sceneName = "Scene"\n            }\n            sceneName = "Scene"\n        )\n        {\n        token preliminary:anchoring:type = "plane"\n        token preliminary:planeAnchoring:alignment = "horizontal"\n\n');
    pr.grupos.forEach(function (gr, g) {
      var nv = gr.pos.length / 3, cont = [], ind = [], pts = [], nrm = [], j;
      for (j = 0; j < nv; j++) {
        pts.push("(" + n(gr.pos[j * 3], casas) + ", " + n(gr.pos[j * 3 + 1], casas) + ", " + n(gr.pos[j * 3 + 2], casas) + ")");
        nrm.push("(" + n(gr.nor[j * 3], 3) + ", " + n(gr.nor[j * 3 + 1], 3) + ", " + n(gr.nor[j * 3 + 2], 3) + ")");
      }
      for (j = 0; j + 2 < gr.idx.length; j += 3) { cont.push("3"); ind.push(gr.idx[j] + ", " + gr.idx[j + 1] + ", " + gr.idx[j + 2]); }
      partes.push('        def Mesh "Malha_' + g + '" (\n            prepend apiSchemas = ["MaterialBindingAPI"]\n        )\n        {\n' +
        '            uniform bool doubleSided = 1\n' +
        '            int[] faceVertexCounts = [' + cont.join(", ") + ']\n' +
        '            int[] faceVertexIndices = [' + ind.join(", ") + ']\n' +
        '            normal3f[] normals = [' + nrm.join(", ") + '] (\n                interpolation = "vertex"\n            )\n' +
        '            point3f[] points = [' + pts.join(", ") + ']\n' +
        '            uniform token subdivisionScheme = "none"\n' +
        '            rel material:binding = </Materials/Mat_' + g + '>\n        }\n\n');
      var cr = gr.cor;
      materiais.push('    def Material "Mat_' + g + '"\n    {\n        def Shader "PreviewSurface"\n        {\n            uniform token info:id = "UsdPreviewSurface"\n' +
        '            color3f inputs:diffuseColor = (' + n(linear(cr[0]), 4) + ', ' + n(linear(cr[1]), 4) + ', ' + n(linear(cr[2]), 4) + ')\n' +
        '            float inputs:roughness = 0.85\n            float inputs:metallic = 0.05\n' +
        '            float inputs:opacity = ' + n(Math.max(0.05, Math.min(1, cr[3])), 2) + '\n' +
        '            int inputs:useSpecularWorkflow = 0\n            token outputs:surface\n        }\n\n' +
        '        token outputs:surface.connect = </Materials/Mat_' + g + '/PreviewSurface.outputs:surface>\n    }\n\n');
    });
    partes.push('        }\n    }\n}\n\ndef "Materials"\n{\n' + materiais.join("") + '}\n');
    var usda = asciiBytes(partes.join(""));
    partes = null;
    return { ok: true, bytes: zipUsdz("model.usda", usda), tri: pr.tri, malhas: pr.grupos.length, escala: pr.escala, tamanho: pr.tamanho };
  }

  // ---------- .glb (Android, Scene Viewer do app do Google) ----------
  /* glTF 2.0 binário: um nó por cor, POSITION + NORMAL + índices uint32,
     material PBR com a cor em LINEAR (a mesma regra do .usdz) e dupla face.
     ⚠ Cada bufferView começa em múltiplo de 4 bytes e os dois blocos (JSON e
     BIN) são completados até múltiplo de 4 — é a regra do formato, e o
     Scene Viewer recusa o arquivo em silêncio quando ela quebra. */
  function gerarGlb(pecas, opts) {
    var pr = preparar(pecas, opts);
    if (!pr.ok) return pr;
    var views = [], acessores = [], malhas = [], nos = [], materiais = [], blocos = [], off = 0;
    function vista(tipado, alvo) {
      var pad = (4 - (off % 4)) % 4;
      if (pad) { blocos.push(new Uint8Array(pad)); off += pad; }
      views.push({ buffer: 0, byteOffset: off, byteLength: tipado.byteLength, target: alvo });
      blocos.push(new Uint8Array(tipado.buffer, tipado.byteOffset, tipado.byteLength)); off += tipado.byteLength;
      return views.length - 1;
    }
    pr.grupos.forEach(function (g, i) {
      var nv = g.pos.length / 3, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (var v = 0; v < nv; v++) for (var e = 0; e < 3; e++) { var x = g.pos[v * 3 + e]; if (x < mn[e]) mn[e] = x; if (x > mx[e]) mx[e] = x; }
      var vp = vista(g.pos, 34962), vn = vista(g.nor, 34962), vi = vista(g.idx, 34963);
      acessores.push({ bufferView: vp, componentType: 5126, count: nv, type: "VEC3", min: mn, max: mx });
      acessores.push({ bufferView: vn, componentType: 5126, count: nv, type: "VEC3" });
      acessores.push({ bufferView: vi, componentType: 5125, count: g.idx.length, type: "SCALAR" });
      var a = Math.max(0.05, Math.min(1, g.cor[3] == null ? 1 : g.cor[3]));
      materiais.push({ name: "Mat_" + i, doubleSided: true, alphaMode: a < 0.99 ? "BLEND" : "OPAQUE",
        pbrMetallicRoughness: { baseColorFactor: [linear(g.cor[0]), linear(g.cor[1]), linear(g.cor[2]), a], metallicFactor: 0.05, roughnessFactor: 0.85 } });
      malhas.push({ name: "Malha_" + i, primitives: [{ attributes: { POSITION: i * 3, NORMAL: i * 3 + 1 }, indices: i * 3 + 2, material: i, mode: 4 }] });
      nos.push({ mesh: i, name: "Malha_" + i });
    });
    var padBin = (4 - (off % 4)) % 4;
    if (padBin) { blocos.push(new Uint8Array(padBin)); off += padBin; }
    var gltf = { asset: { version: "2.0", generator: "OrcaPRO" }, scene: 0, scenes: [{ nodes: nos.map(function (x, i) { return i; }) }],
      nodes: nos, meshes: malhas, materials: materiais, accessors: acessores, bufferViews: views, buffers: [{ byteLength: off }] };
    var js = asciiBytes(JSON.stringify(gltf)), padJs = (4 - (js.length % 4)) % 4;
    var total = 12 + 8 + js.length + padJs + 8 + off, out = new Uint8Array(total), dv = new DataView(out.buffer), p = 0;
    function u32(v) { dv.setUint32(p, v, true); p += 4; }
    u32(0x46546C67); u32(2); u32(total);                         // "glTF", versão 2, tamanho
    u32(js.length + padJs); u32(0x4E4F534A); out.set(js, p); p += js.length;
    for (var s = 0; s < padJs; s++) out[p++] = 0x20;             // JSON completa com espaço
    u32(off); u32(0x004E4942);                                   // "BIN" + zero
    blocos.forEach(function (b) { out.set(b, p); p += b.length; });
    return { ok: true, bytes: out, tri: pr.tri, malhas: pr.grupos.length, escala: pr.escala, tamanho: pr.tamanho };
  }

  /* O aparelho abre .usdz em RA? Réplica da regra do <model-viewer> do
     Google, que é quem mais testou isto em campo: iOS/iPadOS + o Safari diz
     que entende rel="ar" — OU um navegador de iPhone embrulhado no WebKit
     (Chrome, Edge, Firefox, app do Google), que responde "não" à pergunta mas
     entrega o Quick Look assim mesmo. ⚠ iPad novo se apresenta como Mac:
     só o toque (maxTouchPoints) separa um do outro. */
  function quickLook(amb) {
    amb = amb || {};
    var ua = String(amb.ua || ""), ios = /iPad|iPhone|iPod/.test(ua) || (amb.plataforma === "MacIntel" && (amb.toques || 0) > 1);
    if (!ios) return false;
    if (!amb.webview) return !!amb.relAr;
    return /CriOS\/|EdgiOS\/|FxiOS\/|GSA\/|DuckDuckGo\//.test(ua);
  }

  var BimUsdz = { gerar: gerar, gerarGlb: gerarGlb, preparar: preparar, quickLook: quickLook, zipUsdz: zipUsdz, crc32: crc32, LIMITE_TRI: LIMITE_TRI, MAQUETE_M: MAQUETE_M };
  global.BimUsdz = BimUsdz;
  if (typeof module !== "undefined" && module.exports) module.exports = BimUsdz;
})(typeof window !== "undefined" ? window : this);

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

  // ---------- montagem ----------
  function gerar(pecas, opts) {
    opts = opts || {};
    var limite = opts.limiteTri || LIMITE_TRI;
    pecas = (pecas || []).filter(function (p) { return p && p.pos && p.pos.length >= 9 && p.idx && p.idx.length >= 3; });
    if (!pecas.length) return { ok: false, erro: "vazio", tri: 0 };

    var tri = 0, i, j;
    for (i = 0; i < pecas.length; i++) tri += Math.floor(pecas[i].idx.length / 3);
    if (tri > limite) return { ok: false, erro: "grande", tri: tri, limite: limite };

    /* 1ª passada: tudo para o espaço do modelo + caixa envolvente. Guardado
       em Float32 por peça (é o que a cena já usa; o texto sai com 4 casas). */
    var mundo = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (i = 0; i < pecas.length; i++) {
      var p = pecas[i], m = p.matriz || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      var nv = Math.floor(p.pos.length / 3), wp = new Float32Array(nv * 3), wn = new Float32Array(nv * 3);
      var mn = matrizNormal(m), N = mn.n;
      for (j = 0; j < nv; j++) {
        aplicarPonto(m, p.pos[j * 3], p.pos[j * 3 + 1], p.pos[j * 3 + 2], wp, j * 3);
        for (var e = 0; e < 3; e++) { var v = wp[j * 3 + e]; if (v < min[e]) min[e] = v; if (v > max[e]) max[e] = v; }
        if (p.nor && p.nor.length >= nv * 3) {
          var x = p.nor[j * 3], y = p.nor[j * 3 + 1], z = p.nor[j * 3 + 2];
          var nx = N[0] * x + N[1] * y + N[2] * z, ny = N[3] * x + N[4] * y + N[5] * z, nz = N[6] * x + N[7] * y + N[8] * z;
          var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          wn[j * 3] = nx / l; wn[j * 3 + 1] = ny / l; wn[j * 3 + 2] = nz / l;
        } else { wn[j * 3 + 1] = 1; }
      }
      /* ⚠ PEÇA ESPELHADA (det < 0) inverte o sentido dos triângulos: sem
         desvirar, a face de fora vira a de dentro e a peça some no Quick
         Look, que desenha um lado só. */
      mundo.push({ cor: p.cor || [0.8, 0.8, 0.8, 1], pos: wp, nor: wn, idx: p.idx, espelhada: mn.det < 0 });
    }

    /* O Quick Look põe a ORIGEM do arquivo no chão que ele achou. Então a
       base do projeto vai para y=0 e o centro em planta para x=z=0 — sem isto
       um IFC georreferenciado aparece a quilômetros da pessoa, ou enterrado. */
    var cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2, y0 = min[1];
    var lado = Math.max(max[0] - min[0], max[2] - min[2]) || 1;
    var escala = opts.modo === "maquete" ? MAQUETE_M / lado : 1;
    var casas = escala < 0.2 ? 5 : 4;

    // agrupa por cor: centenas de malhas pesam no Quick Look; dezenas não
    var grupos = {}, ordem = [];
    for (i = 0; i < mundo.length; i++) {
      var c = mundo[i].cor, a = c[3] == null ? 1 : c[3];
      var k = n(c[0], 2) + "|" + n(c[1], 2) + "|" + n(c[2], 2) + "|" + n(a, 2);
      if (!grupos[k]) { grupos[k] = { cor: [c[0], c[1], c[2], a], itens: [] }; ordem.push(k); }
      grupos[k].itens.push(mundo[i]);
    }

    var partes = [];
    partes.push('#usda 1.0\n(\n    customLayerData = {\n        string creator = "OrcaPRO"\n    }\n    defaultPrim = "Root"\n    metersPerUnit = 1\n    upAxis = "Y"\n)\n\n');
    partes.push('def Xform "Root"\n{\n    def Scope "Scenes" (\n        kind = "sceneLibrary"\n    )\n    {\n        def Xform "Scene" (\n            customData = {\n                bool preliminary_collidesWithEnvironment = 0\n                string sceneName = "Scene"\n            }\n            sceneName = "Scene"\n        )\n        {\n        token preliminary:anchoring:type = "plane"\n        token preliminary:planeAnchoring:alignment = "horizontal"\n\n');
    var materiais = [];
    for (var g = 0; g < ordem.length; g++) {
      var gr = grupos[ordem[g]], cont = [], ind = [], pts = [], nrm = [], base = 0;
      for (i = 0; i < gr.itens.length; i++) {
        var it = gr.itens[i], nvi = it.pos.length / 3;
        for (j = 0; j < nvi; j++) {
          pts.push("(" + n((it.pos[j * 3] - cx) * escala, casas) + ", " + n((it.pos[j * 3 + 1] - y0) * escala, casas) + ", " + n((it.pos[j * 3 + 2] - cz) * escala, casas) + ")");
          nrm.push("(" + n(it.nor[j * 3], 3) + ", " + n(it.nor[j * 3 + 1], 3) + ", " + n(it.nor[j * 3 + 2], 3) + ")");
        }
        for (j = 0; j + 2 < it.idx.length; j += 3) {
          cont.push("3");
          if (it.espelhada) ind.push((it.idx[j] + base) + ", " + (it.idx[j + 2] + base) + ", " + (it.idx[j + 1] + base));
          else ind.push((it.idx[j] + base) + ", " + (it.idx[j + 1] + base) + ", " + (it.idx[j + 2] + base));
        }
        base += nvi;
      }
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
    }
    partes.push('        }\n    }\n}\n\ndef "Materials"\n{\n' + materiais.join("") + '}\n');

    var usda = asciiBytes(partes.join(""));
    partes = null;
    return {
      ok: true, bytes: zipUsdz("model.usda", usda), tri: tri, malhas: ordem.length, escala: escala,
      tamanho: { x: (max[0] - min[0]) * escala, y: (max[1] - min[1]) * escala, z: (max[2] - min[2]) * escala }
    };
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

  var BimUsdz = { gerar: gerar, quickLook: quickLook, zipUsdz: zipUsdz, crc32: crc32, LIMITE_TRI: LIMITE_TRI, MAQUETE_M: MAQUETE_M };
  global.BimUsdz = BimUsdz;
  if (typeof module !== "undefined" && module.exports) module.exports = BimUsdz;
})(typeof window !== "undefined" ? window : this);

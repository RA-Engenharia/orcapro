/* =====================================================================
 * bim/cristal.js — O CRISTAL ORÇAPRO (logo 3D do BIM). Módulo ES, importado pelo js/bim.js.
 * Especificação: ESPEC-BIM-CUBO-LOGO.md. Quem decide estado/tempo é o motor puro js/bimabertura.js.
 *
 * O que tem: 6 PLACAS de safira verde (cada uma com dobradiça — é o que deixa a tampa abrir e as laterais caírem
 * na "caixa de presente"), e dentro: as 3 barras do logo (1ª concreto, 2ª aço, 3ª diamante luminoso), a estrela
 * de 4 pontas (volumétrica, pisca), "OrçaPRO" na frente e "BIM" atrás (curvas da IBM Plex Sans 600 geradas por
 * tools/gerar-cristal-textos.py — nenhuma fonte em tempo de execução).
 *
 * ⚠ GEOMETRIA DA MARCA: barras e estrela são os CAMINHOS do img/logo-icon.svg (grade 512), copiados aqui — não
 *   redesenhados de olho. Se o logo mudar, trocar os caminhos.
 * ⚠ CENA SEPARADA (overlay): nada daqui entra no modelo, na exportação, no raio do clique ou na RA.
 * ⚠ Sem bloom de pós-processamento: o brilho é emissivo + halos aditivos (mais leve e sem compositor por vista).
 * ===================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

/* img/logo-icon.svg — grade 512, y para BAIXO */
var LOGO = {
  barras: [
    'M120 306 L120 372 Q120 380 128 380 L180 380 Q188 380 188 372 L188 306 Q188 288 170 288 L138 288 Q120 288 120 306 Z',
    'M222 238 L222 372 Q222 380 230 380 L282 380 Q290 380 290 372 L290 238 Q290 220 272 220 L240 220 Q222 220 222 238 Z',
    'M324 170 L324 372 Q324 380 332 380 L384 380 Q392 380 392 372 L392 170 Q392 152 374 152 L342 152 Q324 152 324 170 Z'],
  estrela: 'M402 72 C408 100 408 100 436 106 C408 112 408 112 402 140 C396 112 396 112 368 106 C396 100 396 100 402 72 Z'
};
var VERDE = 0x3ccf73, VERDE_CLARO = 0x9be7af;

/* caminho SVG absoluto (M L H V Q C Z) → ShapePath, com transformação (x, y) → [x', y'].
   ⚠ H e V EXISTEM: o SVGPathPen do fontTools escreve linha reta como "H x"/"V y". Sem elas o leitor engolia os
   números no comando anterior e as letras saíam embaralhadas (medido em 02/10/2026: "OrçaPRO" virava 2 formas
   com 9 furos em vez de 7 letras com 5 furos). */
function caminho(d, tf) {
  var sp = new THREE.ShapePath(), re = /([MLHVQCZ])([^MLHVQCZ]*)/g, m, cx = 0, cy = 0;
  while ((m = re.exec(d))) {
    var n = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [], p = [], k = m[1];
    if (k === 'H') { n = [n[0], cy]; k = 'L'; } else if (k === 'V') { n = [cx, n[0]]; k = 'L'; }
    for (var i = 0; i + 1 < n.length; i += 2) p.push(tf(n[i], n[i + 1]));
    if (n.length >= 2) { cx = n[n.length - 2]; cy = n[n.length - 1]; }
    if (k === 'M') sp.moveTo(p[0][0], p[0][1]);
    else if (k === 'L') sp.lineTo(p[0][0], p[0][1]);
    else if (k === 'Q') sp.quadraticCurveTo(p[0][0], p[0][1], p[1][0], p[1][1]);
    else if (k === 'C') sp.bezierCurveTo(p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1]);
  }
  return sp;
}
export { caminho };
/* textura de concreto (ruído + poros) feita em canvas — sem arquivo */
function texturaConcreto() {
  var c = document.createElement('canvas'); c.width = c.height = 128;
  var g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (var i = 0; i < img.data.length; i += 4) { var v = 150 + Math.random() * 50; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v - 6; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (var k = 0; k < 90; k++) { g.fillStyle = 'rgba(70,70,66,' + (0.25 + Math.random() * 0.35) + ')'; g.beginPath(); g.arc(Math.random() * 128, Math.random() * 128, 0.6 + Math.random() * 1.6, 0, Math.PI * 2); g.fill(); }
  var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 3);
  try { t.colorSpace = THREE.SRGBColorSpace; } catch (e) {}
  return t;
}
function texturaHalo(cor, semCruz) {
  var c = document.createElement('canvas'); c.width = c.height = 128;
  var g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, cor); gr.addColorStop(0.55, 'rgba(60,207,115,0.18)'); gr.addColorStop(1, 'rgba(60,207,115,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  if (semCruz) return new THREE.CanvasTexture(c);
  /* o brilho cruzado da estrela (4 raios) */
  g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(220,255,230,0.55)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(64, 4); g.lineTo(64, 124); g.moveTo(4, 64); g.lineTo(124, 64); g.stroke();
  return new THREE.CanvasTexture(c);
}

/* opts = { renderer, transmissao (bool), textos (o JSON de bim/cristal-textos.json) } */
export function criarCristal(opts) {
  opts = opts || {};
  var renderer = opts.renderer;
  var cena = new THREE.Scene();
  var pmrem = new THREE.PMREMGenerator(renderer);
  var amb = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environment = amb;
  cena.add(new THREE.AmbientLight(0xffffff, 0.35));
  var sol = new THREE.DirectionalLight(0xffffff, 1.1); sol.position.set(2.5, 3.5, 4); cena.add(sol);
  var luzVerde = new THREE.PointLight(VERDE, 2.2, 3.2); cena.add(luzVerde);

  var raiz = new THREE.Group(); cena.add(raiz);           // gira/flutua/inclina
  var caixa = new THREE.Group(); raiz.add(caixa);          // as 6 placas
  var logo = new THREE.Group(); raiz.add(logo);            // o que vai dentro

  /* ---- as 6 placas de safira, cada uma num pivô na aresta da dobradiça ---- */
  /* ⚠ A TRANSMISSÃO DO three NÃO VÊ O BIM ATRÁS: ela amostra só a cena do cristal (o fundo é a cor de limpeza).
     Por isso o verde vem da COR + atenuação + um emissivo baixo — sem eles a safira saía cinza (medido 02/10). */
  /* ⚠ espessura BAIXA: com 0,45 a refração deslocava o que está dentro e o nome aparecia DUAS vezes (medido 02/10) */
  var VIDRO_OPAC = 0.42, VIDRO_OPAC_CANTO = 0.4, VIDRO_COR = 0x8eecb8, VIDRO_COR_CANTO = 0x2fbf6f;
  var matVidro = new THREE.MeshPhysicalMaterial({
    color: VIDRO_COR, metalness: 0, roughness: 0.03, ior: 1.77, transmission: opts.transmissao ? 1 : 0, thickness: 0.1,
    attenuationColor: new THREE.Color(0x0f8f48), attenuationDistance: 0.35, clearcoat: 1, clearcoatRoughness: 0.02,
    emissive: new THREE.Color(0x0c5a30), emissiveIntensity: 0.3,
    specularIntensity: 1, envMapIntensity: 1.9, transparent: true, opacity: opts.transmissao ? 1 : VIDRO_OPAC, side: THREE.DoubleSide, depthWrite: false
  });
  /* ⚠ arestas em mistura NORMAL: aditiva sobre o fundo claro do BIM satura em branco e a safira some (medido 02/10) */
  var matAresta = new THREE.LineBasicMaterial({ color: 0x1fae5c, transparent: true, opacity: 0.95, depthWrite: false });
  /* arestas que BRILHAM no centro (linha de 1 px some na tela grande): bastões finos */
  var matArestaBrilho = new THREE.MeshBasicMaterial({ color: 0x3ccf73, transparent: true, opacity: 0.85, depthWrite: false });
  var E = 0.5, ESP = 0.035, geoPlaca = new RoundedBoxGeometry(1, 1, ESP, 2, 0.012);
  /* ⚠ cada aresta do cubo UMA vez: com o contorno de todas as placas as arestas saíam em linha dupla (as placas se
     encostam com a espessura entre elas) — frente/trás levam as 4, as laterais só as 2 horizontais, tampa/fundo nenhuma */
  var ARESTAS = { frente: [0, 1, 2, 3], tras: [0, 1, 2, 3], direita: [0, 1], esquerda: [0, 1], tampa: [], fundo: [] };
  var LADOS = [[0, 0.5, 0, 0], [0, -0.5, 0, 0], [0.5, 0, 1, 0], [-0.5, 0, 1, 0]];
  var geoBastao = new THREE.CylinderGeometry(0.0065, 0.0065, 1, 6, 1, true), bastoes = [];
  /* placa no plano XY, com o pivô numa aresta: [nome, posição do pivô, rotação de montagem, deslocamento da placa a partir do pivô, eixo e sinal da abertura] */
  var PLACAS = [
    ['frente', [0, -E, E], [0, 0, 0], [0, E, 0], ['x', 1]],
    ['tras', [0, -E, -E], [0, Math.PI, 0], [0, E, 0], ['x', -1]],
    ['direita', [E, -E, 0], [0, Math.PI / 2, 0], [0, E, 0], ['z', -1]],
    ['esquerda', [-E, -E, 0], [0, -Math.PI / 2, 0], [0, E, 0], ['z', 1]],
    ['fundo', [0, -E, 0], [-Math.PI / 2, 0, 0], [0, 0, 0], null],
    ['tampa', [0, E, -E], [-Math.PI / 2, 0, 0], [0, -E, 0], ['x', -1]]
  ];
  var placas = {};
  PLACAS.forEach(function (d) {
    var piv = new THREE.Group(); piv.position.set(d[1][0], d[1][1], d[1][2]);
    var mont = new THREE.Group(); mont.rotation.set(d[2][0], d[2][1], d[2][2]); piv.add(mont);
    var m = new THREE.Mesh(geoPlaca, matVidro); m.position.set(d[3][0], d[3][1], d[3][2]); m.renderOrder = 2;
    var ql = [];
    ARESTAS[d[0]].forEach(function (i) { var b = LADOS[i]; if (b[2]) ql.push(b[0], -0.5, 0, b[0], 0.5, 0); else ql.push(-0.5, b[1], 0, 0.5, b[1], 0); });
    var gl = new THREE.BufferGeometry(); gl.setAttribute('position', new THREE.Float32BufferAttribute(ql, 3));
    var ln = new THREE.LineSegments(gl, matAresta); ln.position.set(m.position.x, m.position.y, m.position.z + ESP / 2); ln.renderOrder = 3;
    mont.add(m); mont.add(ln); caixa.add(piv);
    ARESTAS[d[0]].map(function (i) { return LADOS[i]; }).forEach(function (b) {
      var bs = new THREE.Mesh(geoBastao, matArestaBrilho); bs.position.set(m.position.x + b[0], m.position.y + b[1], m.position.z + ESP / 2);
      if (!b[2]) bs.rotation.z = Math.PI / 2; bs.renderOrder = 4; mont.add(bs); bastoes.push(bs);
    });
    placas[d[0]] = { piv: piv, mont: mont, abre: d[4] };
  });

  /* ---- o logo dentro: barras, estrela, nomes ---- */
  /* o desenho do logo vai de x 120 a 436 e de y 72 a 380 (grade 512): centrado em x e um pouco acima do meio */
  var S = 0.8 / 512;
  function tf(x, y) { return [(x - 278) * S, (226 - y) * S + 0.06]; }
  var matConcreto = new THREE.MeshStandardMaterial({ color: 0xc9c9c0, roughness: 0.92, metalness: 0, map: texturaConcreto() });
  var matAco = new THREE.MeshStandardMaterial({ color: 0xe9eef3, roughness: 0.18, metalness: 1, envMapIntensity: 1.8 });
  var matDiamante = new THREE.MeshPhysicalMaterial({ color: 0x5dffa0, roughness: 0.02, metalness: 0.1, transmission: 0, ior: 2.42, clearcoat: 1, clearcoatRoughness: 0,
    iridescence: 1, iridescenceIOR: 1.35, emissive: new THREE.Color(VERDE), emissiveIntensity: 1.1, envMapIntensity: 2.4, flatShading: true });
  var barras = [];
  [matConcreto, matAco, matDiamante].forEach(function (mat, i) {
    var shapes = caminho(LOGO.barras[i], tf).toShapes(true);
    var g = new THREE.ExtrudeGeometry(shapes, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: i === 2 ? 1 : 2, curveSegments: 6 });
    g.computeBoundingBox(); var base = g.boundingBox.min.y;
    g.translate(0, -base, -0.045);                         // base da barra na origem: a escala em y "enche" a barra
    var mm = new THREE.Mesh(g, mat); mm.position.y = base; logo.add(mm);
    barras.push(mm);
  });
  var gEst = new THREE.ExtrudeGeometry(caminho(LOGO.estrela, tf).toShapes(true), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.01, bevelSegments: 3, curveSegments: 10 });
  gEst.computeBoundingBox(); var cEst = gEst.boundingBox.getCenter(new THREE.Vector3()); gEst.translate(-cEst.x, -cEst.y, -0.025);
  var matEstrela = new THREE.MeshStandardMaterial({ color: 0xe6fff0, emissive: new THREE.Color(VERDE_CLARO), emissiveIntensity: 1.4, roughness: 0.25, metalness: 0.1 });
  var estrela = new THREE.Mesh(gEst, matEstrela); estrela.position.set(cEst.x, cEst.y, 0.02); logo.add(estrela);
  var haloTex = texturaHalo('rgba(155,231,175,0.9)');
  function halo(tam, op) { var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: op })); sp.scale.set(tam, tam, 1); sp.renderOrder = 5; return sp; }
  var haloEstrela = halo(0.36, 0.9); haloEstrela.position.copy(estrela.position); logo.add(haloEstrela);
  var haloDiamante = halo(0.42, 0.35); var bb3 = new THREE.Box3().setFromObject(barras[2]); haloDiamante.position.copy(bb3.getCenter(new THREE.Vector3())); logo.add(haloDiamante);
  var haloCentroTex = texturaHalo('rgba(155,231,175,0.9)', true);
  var haloCentro = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloCentroTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  haloCentro.scale.set(2.4, 2.4, 1); haloCentro.renderOrder = 6; raiz.add(haloCentro);   // a explosão de luz da abertura
  /* o "brilho de dentro" da safira — textura SEM a cruz (com ela, riscos brancos atravessavam o cubo inteiro) */
  var haloNucleo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloCentroTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.32 }));
  haloNucleo.scale.set(1.35, 1.35, 1); haloNucleo.renderOrder = 1; logo.add(haloNucleo);

  var matTexto = new THREE.MeshStandardMaterial({ color: 0xf4fff8, emissive: new THREE.Color(0x3ccf73), emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.05 });
  function texto(t, largura, y, z, deCostas) {
    if (!t) return null;
    var esc = largura / t.largura;
    /* ⚠ toShapes(FALSE): contorno externo da fonte TrueType é horário (y para cima); com `true` os furos do O, a, P e R
       viravam letras cheias (medido em 02/10/2026: 7 formas e 5 furos só com false) */
    var g = new THREE.ExtrudeGeometry(caminho(t.caminho, function (x, yy) { return [x * esc, yy * esc]; }).toShapes(false), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.003, bevelSegments: 1, curveSegments: 5 });
    g.computeBoundingBox(); var c = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -0.011);
    var mm = new THREE.Mesh(g, matTexto); mm.position.set(0, y, z); if (deCostas) mm.rotation.y = Math.PI; logo.add(mm); return mm;
  }
  var tx = (opts.textos && opts.textos.textos) || {};
  var nomeFrente = texto(tx.OrcaPRO, 0.82, -0.33, 0.38, false);
  var nomeTras = texto(tx.BIM, 0.42, -0.33, -0.38, true);

  /* partículas da abertura (aditivas) */
  var NP = opts.particulas == null ? 260 : opts.particulas, pos = new Float32Array(NP * 3), vel = [];
  for (var p = 0; p < NP; p++) { var a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), v = 0.6 + Math.random() * 1.4; vel.push([Math.sin(b) * Math.cos(a) * v, Math.abs(Math.cos(b)) * v * 1.2, Math.sin(b) * Math.sin(a) * v]); }
  var gPart = new THREE.BufferGeometry(); gPart.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var particulas = new THREE.Points(gPart, new THREE.PointsMaterial({ color: 0x9dffc4, size: 0.035, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  particulas.renderOrder = 7; raiz.add(particulas);

  /* câmeras: perspectiva no centro; ortográfica no canto (alinhada à câmera da vista — mesma rotação do cubo HTML) */
  var camCentro = new THREE.PerspectiveCamera(28, 1, 0.1, 50); camCentro.position.set(0, 0.12, 5.4); camCentro.lookAt(0, 0, 0);
  var camCanto = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);

  /* estado de interação (centro) */
  /* parado: balança ±0,4 rad em torno da FRENTE (com giro contínuo o nome passava a maior parte do tempo de lado);
     o arraste soma um giro livre que volta devagar para a frente */
  var giro = { y: 0, x: 0, vy: 0, vx: 0, alvoIncX: 0, alvoIncY: 0, incX: 0, incY: 0, pulo: 0 };

  function aplicarAbertura(q, emCanto) {
    var volta = q ? (1 - (q.paraOCanto || 0)) : 1;          // ao voltar pequeno, as placas se refazem
    var tampa = q ? q.tampaGraus * volta : 0, lados = q ? q.ladosGraus * volta : 0;
    Object.keys(placas).forEach(function (k) {
      var pl = placas[k]; if (!pl.abre) return;
      var ang = (k === 'tampa' ? tampa : lados) * Math.PI / 180 * pl.abre[1];
      pl.piv.rotation.set(0, 0, 0); pl.piv.rotation[pl.abre[0]] = ang;
    });
    /* no canto o logo cresce 1,6× (em 60 px de cubo, o tamanho do centro vira um borrão de 20 px) */
    var r = q ? q.respira : 0; caixa.scale.setScalar(1 + r); logo.scale.setScalar((1 + r * 0.5) * (emCanto ? 1.6 : 1));
    matVidro.color.setHex(emCanto ? VIDRO_COR_CANTO : VIDRO_COR);
    luzVerde.intensity = 2.2 * (1 + (q ? q.luz : 0));
    var opc = q ? Math.max(0, Math.min(1, q.cristalOpac)) : 1;
    matVidro.opacity = (opts.transmissao && !emCanto ? 1 : (emCanto ? VIDRO_OPAC_CANTO : VIDRO_OPAC)) * opc; matAresta.opacity = 0.9 * opc;
    matVidro.transmission = (opts.transmissao && !emCanto) ? 1 : 0;
    matArestaBrilho.opacity = emCanto ? 0 : 0.85 * opc;
    bastoes.forEach(function (b) { b.visible = !emCanto; });
    if (nomeFrente) nomeFrente.visible = !emCanto; if (nomeTras) nomeTras.visible = !emCanto;
    haloNucleo.material.opacity = emCanto ? 0.22 : 0.32;
    matDiamante.emissiveIntensity = emCanto ? 1.6 : 1.1;
    logo.visible = opc > 0.02;
    var ex = q ? q.explosao : 0;
    haloCentro.material.opacity = ex * 0.6; haloCentro.scale.setScalar(1.2 + ex * 2.2);
    particulas.material.opacity = ex;
    var arr = gPart.attributes.position.array, rr = (q ? Math.max(0, (q.t - 300) / 1000) : 0);
    for (var i = 0; i < NP; i++) { arr[i * 3] = vel[i][0] * rr; arr[i * 3 + 1] = vel[i][1] * rr; arr[i * 3 + 2] = vel[i][2] * rr; }
    gPart.attributes.position.needsUpdate = true;
  }
  function aplicarBarras(prog3) { barras.forEach(function (b, i) { b.scale.y = Math.max(0.04, prog3 ? prog3[i] : 1); }); }
  function aplicarEstrela(e) { estrela.scale.setScalar(e.escala); matEstrela.emissiveIntensity = e.brilho; haloEstrela.material.opacity = Math.min(1, 0.35 + e.brilho * 0.4); haloEstrela.scale.setScalar(0.36 * e.escala); }

  return {
    cena: cena, raiz: raiz, camCentro: camCentro, camCanto: camCanto, placas: placas, barras: barras, estrela: estrela, nomeFrente: nomeFrente, nomeTras: nomeTras,
    /* passo do centro: gira devagar, flutua, inclina para o cursor; arrastar dá impulso */
    animarCentro: function (dt, tSeg, semMovimento) {
      if (semMovimento) { raiz.rotation.set(0.12, 0.35, 0); raiz.position.y = 0; return; }
      giro.vy *= Math.max(0, 1 - dt * 1.6); giro.vx *= Math.max(0, 1 - dt * 3);
      giro.y += giro.vy * dt; giro.x += giro.vx * dt; giro.x *= Math.max(0, 1 - dt * 1.5);
      if (Math.abs(giro.vy) < 0.4) { var volta = Math.round(giro.y / (Math.PI * 2)) * Math.PI * 2; giro.y += (volta - giro.y) * Math.min(1, dt * 0.9); }
      giro.incX += (giro.alvoIncX - giro.incX) * Math.min(1, dt * 5); giro.incY += (giro.alvoIncY - giro.incY) * Math.min(1, dt * 5);
      giro.pulo = Math.max(0, giro.pulo - dt * 2.5);
      raiz.rotation.set(0.12 + giro.x + giro.incX, giro.y + giro.incY + Math.sin(tSeg * 0.45) * 0.4, 0);
      raiz.position.y = Math.sin(tSeg * 1.3) * 0.04 + Math.sin(giro.pulo * Math.PI) * 0.15;
    },
    arrastar: function (dx, dy) { giro.vy = dx * 0.012 * 60; giro.vx = dy * 0.008 * 60; },
    inclinar: function (nx, ny) { giro.alvoIncY = nx * 0.26; giro.alvoIncX = ny * 0.2; },
    pular: function () { giro.pulo = 1; },
    aplicarAbertura: aplicarAbertura, aplicarBarras: aplicarBarras, aplicarEstrela: aplicarEstrela,
    /* desenha no retângulo (px CSS do canvas, origem embaixo à esquerda como o WebGL).
       ⚠ px CSS, NÃO do aparelho: o setViewport/setScissor do three já multiplica pelo pixelRatio — em px do aparelho
       o cristal sairia deslocado e grande em tela com zoom do Windows (125 %, 150 %). */
    desenhar: function (rect, cam) {
      /* cada nome só aparece de FRENTE para a câmera ("BIM" atrás não pode surgir espelhado pelo vidro) */
      cam.updateMatrixWorld();
      [nomeFrente, nomeTras].forEach(function (n) {
        if (!n || !n.visible) return;
        var pw = new THREE.Vector3(), qw = new THREE.Quaternion(); n.getWorldPosition(pw); n.getWorldQuaternion(qw);
        var nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(qw), aCam = cam.position.clone().sub(pw);
        if (cam.isOrthographicCamera) aCam = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion);
        n.visible = nrm.dot(aCam) > 0;
      });
      var r = renderer, ac = r.autoClear;
      r.autoClear = false; r.clearDepth();
      r.setScissorTest(true); r.setViewport(rect.x, rect.y, rect.w, rect.h); r.setScissor(rect.x, rect.y, rect.w, rect.h);
      r.render(cena, cam);
      r.setScissorTest(false);
      var tam = r.getSize(new THREE.Vector2()); r.setViewport(0, 0, tam.x, tam.y);
      r.autoClear = ac;
      if (nomeFrente) nomeFrente.visible = true; if (nomeTras) nomeTras.visible = true;
    },
    /* o canto: rotação da câmera da vista; 1 unidade do cubo = `ladoPx` pixels do retângulo */
    prepararCanto: function (quatCam, rect, ladoPx) {
      raiz.rotation.set(0, 0, 0); raiz.position.set(0, 0, 0);
      var h = rect.h / ladoPx / 2, w = rect.w / ladoPx / 2;
      camCanto.left = -w; camCanto.right = w; camCanto.top = h; camCanto.bottom = -h; camCanto.updateProjectionMatrix();
      camCanto.quaternion.copy(quatCam); camCanto.position.set(0, 0, 6).applyQuaternion(quatCam); camCanto.updateMatrixWorld();
    },
    descartar: function () {
      cena.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      try { amb.dispose(); pmrem.dispose(); } catch (e) {}
    }
  };
}

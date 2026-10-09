/* =====================================================================
 * bimrendermotor.js — O MOTOR DO RENDER FÍSICO (módulo ES, 09/10/2026)
 *
 * Path tracing progressivo no navegador com o three-gpu-pathtracer 0.0.27
 * (MIT), em bim/vendor/jsm/pathtracer/ — ver o ORIGEM.txt de lá.
 *
 * ⚠ ESTE MÓDULO TEM O SEU PRÓPRIO THREE (r186), separado do r150 do
 *   visualizador (js/bim.js). O path tracer da época do r150 (0.0.16) não
 *   compila no Chrome de hoje: o shader derruba o contexto WebGL (medido em
 *   09/10/2026 no D3D11 e no SwiftShader — o shader seguinte, até um vazio,
 *   já não compila). O 0.0.27 compila, mas pede three ≥ 0.185. Trocar o
 *   three do visualizador mexeria em 16 mil linhas que funcionam; então o
 *   render roda ISOLADO: este arquivo só é importado quando o painel do
 *   render abre, e a cena chega aqui como DADOS (Float32Array de posição,
 *   normal, uv; parâmetros do material; luzes; céu) — nenhum objeto do r150
 *   atravessa a fronteira. O canvas e o contexto WebGL também são próprios.
 *
 * Quem decide os números (material, luz, sol, céu, exposição) é o
 * js/rendermat.js; quem extrai a cena do modelo e desenha a tela é o
 * js/bimrender.js. Aqui só se monta a cena física e se acumulam amostras.
 *
 * Saída para a tela: [path tracer, float] → exposição + balanço de branco
 * (linear) → redução de ruído opcional → curva de tom (AgX/ACES/neutra, as
 * do próprio three) → sRGB no canvas.
 * ===================================================================== */
import * as THREE from '../bim/vendor/jsm/pathtracer/three/three.module.js';
import { FullScreenQuad } from '../bim/vendor/jsm/pathtracer/three/Pass.js';
import { WebGLPathTracer, ShapedAreaLight, PhysicalSpotLight, DenoiseMaterial, PhysicalCamera } from '../bim/vendor/jsm/pathtracer/three-gpu-pathtracer.module.js';

const TOM = { agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutro: THREE.NeutralToneMapping };

/* a passada de exposição: linear × exposição × matriz do balanço de branco */
function materialExpor() {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, exposicao: { value: 1 }, wb: { value: new THREE.Matrix3() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float exposicao; uniform mat3 wb; varying vec2 vUv;' +
      'void main(){ vec4 c = texture2D(map, vUv); vec3 l = wb * (c.rgb * exposicao); gl_FragColor = vec4(max(l, vec3(0.0)), 1.0); }',
    toneMapped: false, depthTest: false, depthWrite: false, blending: THREE.NoBlending
  });
}

function corLin(c) { return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace); }

export class MotorRender {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.pt = new WebGLPathTracer(this.renderer);
    /* o motor desenha a tela por conta própria (exposição e tom antes do canvas) */
    this.pt.renderToCanvas = false; this.pt.rasterizeScene = false;
    this.pt.renderDelay = 0; this.pt.minSamples = 0; this.pt.fadeDuration = 0;
    this.pt.filterGlossyFactor = 0.5;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 5000);
    this.luzes = {}; this.sol = null; this.texturas = []; this._cacheTex = {};
    this.qExpor = new FullScreenQuad(materialExpor());
    this.qDenoise = new FullScreenQuad(new DenoiseMaterial({ map: null, sigma: 3, kSigma: 1.5, threshold: 0.12 }));
    this.qSimples = new FullScreenQuad(new THREE.MeshBasicMaterial({ map: null }));
    this.rtLinear = null;
    this.exp = { auto: true, ev: 12, comp: 0, medido: false };
    this.denoise = true; this.ativo = false; this.alvo = 256; this._raf = 0; this._t = [];
  }

  /* o caminho da textura CC0: uma por arquivo, reaproveitada entre materiais (clone = outra escala) */
  /* ⚠ a cena só vai para o path tracer DEPOIS que as imagens chegaram: textura
     sem imagem vira preto no atlas do path tracer (medido: parede pintada saía
     preta enquanto o piso, de textura gerada aqui, saía certo) */
  _textura(url, srgb) {
    if (!url) return null;
    if (!this._cacheTex[url]) {
      const t = new THREE.Texture();
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      this._pend.push(new THREE.ImageLoader().loadAsync(url).then((img) => { t.image = img; t.needsUpdate = true; }, () => { t.userData.erro = true; }));
      this._cacheTex[url] = t; this.texturas.push(t);
    }
    return this._cacheTex[url];
  }
  _texDados(px, w, h, srgb) {
    const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    this.texturas.push(t);
    return t;
  }
  _material(p) {
    const m = new THREE.MeshPhysicalMaterial({
      color: corLin(p.cor), roughness: p.rugosidade, metalness: p.metalicidade, ior: p.ior,
      transmission: p.transmissao, thickness: p.espessuraVolume || 0,
      clearcoat: p.clearcoat, clearcoatRoughness: p.clearcoatRugosidade,
      sheen: p.sheen, sheenColor: corLin(p.sheenCor || [1, 1, 1]), sheenRoughness: p.sheenRugosidade,
      side: THREE.DoubleSide
    });
    if (p.atenuacao && p.espessuraVolume > 0) { m.attenuationColor = corLin(p.atenuacao.cor); m.attenuationDistance = p.atenuacao.distancia; }
    const tx = p.textura;
    if (tx && tx.tipo === 'cc0' && tx.arquivos) {
      const rep = [1 / tx.escala, 1 / (tx.escala * (tx.asp || 1))];
      const ap = (t) => { if (!t) return null; const c = t.clone(); c.repeat.set(rep[0], rep[1]); c.needsUpdate = true; this.texturas.push(c); return c; };
      m.map = ap(this._textura(tx.arquivos.cor, true));
      if (p.relevo > 0 && tx.arquivos.normal) { m.normalMap = ap(this._textura(tx.arquivos.normal, false)); m.normalScale.set(p.relevo, p.relevo); }
      if (tx.tinta) m.color = corLin(tx.tinta);
    } else if (tx && tx.tipo === 'imagem' && tx.imagem) {
      /* objeto importado com textura própria: a MESMA imagem (elemento do DOM), num Texture deste three */
      const t = new THREE.Texture(tx.imagem); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(tx.repeat[0], tx.repeat[1]); t.offset.set(tx.offset[0], tx.offset[1]); t.needsUpdate = true; this.texturas.push(t);
      m.map = t;
    } else if (tx && tx.tipo === 'rejunte' && tx.mapas) {
      const g = tx.mapas, rep = [1 / g.repeticao[0], 1 / g.repeticao[1]];
      const cor = this._texDados(g.cor, g.largura, g.altura, true), msk = this._texDados(g.mascara, g.largura, g.altura, false), nor = this._texDados(g.normal, g.largura, g.altura, false);
      [cor, msk, nor].forEach((t) => t.repeat.set(rep[0], rep[1]));
      m.map = cor; m.roughnessMap = msk; m.roughness = 1; m.clearcoatMap = p.clearcoat > 0 ? msk : null;
      if (p.relevo > 0) { m.normalMap = nor; m.normalScale.set(p.relevo * 2, p.relevo * 2); }
    }
    m.userData.id = p.id;
    return m;
  }

  /* monta a cena física a partir dos DADOS (js/bimrender.js extrai do modelo) */
  preparar(cena) {
    this.limparCena();
    this._pend = [];
    const tok = this._tok = (this._tok || 0) + 1;   /* uma preparação nova invalida a anterior (a que ainda esperava imagens) */
    const sc = this.scene;
    const mats = (cena.materiais || []).map((p) => this._material(p));
    (cena.grupos || []).forEach((g) => {
      if (!g.pos || !g.pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
      if (g.idx) geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
      const ms = new THREE.Mesh(geo, mats[g.mat] || mats[0]);
      ms.userData.grupo = g.mat;
      sc.add(ms);
    });
    /* luzes do projeto */
    (cena.luzes || []).forEach((l) => {
      let o;
      if (l.tipo === 'painel') {
        o = new ShapedAreaLight(corLin(l.cor), l.intensidade, l.largura, l.profundidade);
        o.isCircular = !!l.circular;
        o.position.set(l.posicao[0], l.posicao[1], l.posicao[2]);
        o.rotation.order = 'YXZ'; o.rotation.y = l.rotY || 0; o.rotation.x = -Math.PI / 2;   /* −z local para baixo: o painel ilumina o piso */
        o.visibleToCameraRays = true;
      } else if (l.tipo === 'spot') {
        o = new PhysicalSpotLight(corLin(l.cor), l.intensidade, 0, l.angulo / 2 * Math.PI / 180, 0.3, 2);
        o.radius = 0.03; o.position.set(l.posicao[0], l.posicao[1], l.posicao[2]);
        o.target.position.set(l.posicao[0], l.posicao[1] - 1, l.posicao[2]); sc.add(o.target);
      } else {
        o = new THREE.PointLight(corLin(l.cor), l.intensidade, 0, 2);
        o.position.set(l.posicao[0], l.posicao[1] - 0.05, l.posicao[2]);
      }
      o.visible = l.ligada !== false; o.userData.id = l.id; o.userData.base = l.intensidade;
      this.luzes[l.id] = o; sc.add(o);
    });
    /* o sol (luz direcional, iluminância normal em lux) */
    if (cena.sol && cena.sol.lux > 0) {
      const d = cena.sol.direcao, s = new THREE.DirectionalLight(corLin(cena.sol.cor), cena.sol.lux);
      s.position.set(d[0] * 1000, d[1] * 1000, d[2] * 1000); s.target.position.set(0, 0, 0);
      sc.add(s); sc.add(s.target); this.sol = s;
    }
    /* o céu (cd/m², equiretangular) é o ambiente E o fundo: a janela mostra o céu */
    if (cena.ceu) {
      const t = new THREE.DataTexture(cena.ceu.dados, cena.ceu.largura, cena.ceu.altura, THREE.RGBAFormat, THREE.FloatType);
      t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.LinearSRGBColorSpace;
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
      sc.environment = t; sc.background = t; this._ceu = t;
    }
    this.cenaInfo = { grupos: (cena.grupos || []).length, luzes: (cena.luzes || []).length, triangulos: (cena.grupos || []).reduce((s, g) => s + (g.idx ? g.idx.length : g.pos.length / 3) / 3, 0), texturas: this.texturas.length };
    /* espera as imagens; a que não veio sai do material (a cor base fica) */
    return Promise.all(this._pend).then(() => {
      if (tok !== this._tok) return this.cenaInfo;
      let falhas = 0;
      sc.traverse((o) => { const m = o.material; if (!m) return; ["map", "normalMap"].forEach((k) => { if (m[k] && (m[k].userData.erro || !m[k].image)) { if (m[k].userData.erro) falhas++; m[k] = null; m.needsUpdate = true; } }); });
      this.cenaInfo.texturasFalharam = falhas;
      return this.cenaInfo;
    });
  }

  camera_(c, w, h) {
    let cam;
    if (c.tipo === 'ortogonal') {
      cam = new THREE.OrthographicCamera(c.esquerda, c.direita, c.topo, c.base, c.near, c.far);
      const asp = w / h, alt = (c.topo - c.base) / (c.zoom || 1), larg = alt * asp, cx = (c.esquerda + c.direita) / 2 / (c.zoom || 1), cy = (c.topo + c.base) / 2 / (c.zoom || 1);
      cam.left = cx - larg / 2; cam.right = cx + larg / 2; cam.top = cy + alt / 2; cam.bottom = cy - alt / 2;
    } else {
      cam = new PhysicalCamera(c.fov || 50, w / h, Math.max(0.02, c.near || 0.1), c.far || 5000);
      if (c.dof && c.dof.ligado) { cam.focusDistance = c.dof.distancia; cam.fStop = c.dof.fStop; cam.apertureBlades = 6; } else { cam.bokehSize = 0; }
    }
    cam.position.set(c.pos[0], c.pos[1], c.pos[2]);
    cam.quaternion.set(c.quat[0], c.quat[1], c.quat[2], c.quat[3]);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    return cam;
  }

  /* começa (ou recomeça) o render: plano = {amostras, quiques, w, h, tom, ev|null, comp, wb:[9], denoise, camera} */
  iniciar(plano, aoProgresso) {
    this.parar();
    const w = plano.w, h = plano.h;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.toneMapping = TOM[plano.tom] || THREE.AgXToneMapping;
    this.camera = this.camera_(plano.camera, w, h);
    this.pt.bounces = plano.quiques; this.pt.transmissiveBounces = Math.max(6, plano.quiques);
    /* tiles: imagem grande em pedaços, para cada quadro caber no tempo do driver (sem travar a tela) */
    const px = w * h, n = px > 4e6 ? 4 : (px > 1.5e6 ? 3 : (px > 6e5 ? 2 : 1));
    this.pt.tiles.set(n, n);
    if (!this._cenaPronta) { this.pt.setScene(this.scene, this.camera); this._cenaPronta = true; }
    else { this.pt.setCamera(this.camera); this.pt.updateLights(); }
    this.alvo = plano.amostras; this.denoise = plano.denoise !== false;
    this.exp = { auto: plano.ev == null, ev: plano.ev == null ? 12 : plano.ev, comp: plano.comp || 0, medido: plano.ev != null };
    const wb = plano.wb || [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.qExpor.material.uniforms.wb.value.set(wb[0], wb[1], wb[2], wb[3], wb[4], wb[5], wb[6], wb[7], wb[8]);
    if (this.rtLinear) this.rtLinear.dispose();
    this.rtLinear = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: false });
    this.ativo = true; this._t = []; this._ultimo = { s: 0, t: performance.now() }; this.inicio = performance.now();
    this.aoProgresso = aoProgresso || null;
    this.pt.reset();
    const passo = () => {
      if (!this.ativo) return;
      if (!this.canvas.isConnected) { this.parar(); return; }
      const t0 = performance.now();
      /* várias amostras por quadro enquanto couber em ~30 ms (a tela continua respondendo) */
      do { this.pt.renderSample(); } while (!this.pt.isCompiling && this.pt.samples < this.alvo && performance.now() - t0 < 30);
      this._medir();
      if (this.exp.auto && !this.exp.medido && this.pt.samples >= 4) this.medirExposicao();
      this.desenhar();
      if (this.aoProgresso) { try { this.aoProgresso(this.progresso()); } catch (e) { /* a tela não derruba o render */ } }
      if (this.pt.samples >= this.alvo) { this.ativo = false; if (this.aoProgresso) { try { this.aoProgresso(this.progresso()); } catch (e) {} } return; }
      this._raf = requestAnimationFrame(passo);
    };
    this._raf = requestAnimationFrame(passo);
  }
  /* AQUECER: compila o shader do path tracer enquanto a pessoa ainda confere o painel. No
     Chrome do Windows (Direct3D) a 1ª compilação leva 1 a 1,5 min (medido 85–90 s numa RTX 5060);
     começar ao ABRIR o painel tira esse tempo da espera do clique em Renderizar. Nada vai à tela. */
  aquecer(plano) {
    this.parar();
    this.renderer.setPixelRatio(1); this.renderer.setSize(64, 36, false);
    this.camera = this.camera_(plano.camera, 64, 36);
    this.pt.bounces = plano.quiques; this.pt.transmissiveBounces = Math.max(6, plano.quiques); this.pt.tiles.set(1, 1);
    this.pt.setScene(this.scene, this.camera); this._cenaPronta = true;
    this._aquecendo = true; const t0 = performance.now();
    const passo = () => {
      if (!this._aquecendo) return;
      this.pt.renderSample();
      if (this.pt.samples >= 1 && !this.pt.isCompiling) { this._aquecendo = false; this.aquecido = performance.now() - t0; return; }
      this._rafA = requestAnimationFrame(passo);
    };
    this._rafA = requestAnimationFrame(passo);
  }
  _medir() {
    const s = this.pt.samples, t = performance.now();
    if (s > this._ultimo.s + 0.999) {
      this._t.push((t - this._ultimo.t) / (s - this._ultimo.s));
      if (this._t.length > 12) this._t.shift();
      this._ultimo = { s, t };
    }
  }
  msPorAmostra() { if (!this._t.length) return NaN; const l = this._t.slice().sort((a, b) => a - b); return l[Math.floor(l.length / 2)]; }
  progresso() {
    return { amostras: Math.floor(this.pt.samples), alvo: this.alvo, compilando: !!this.pt.isCompiling, msPorAmostra: this.msPorAmostra(),
             decorrido: performance.now() - this.inicio, ev: this.exp.ev, evAuto: this.exp.auto, pronto: this.pt.samples >= this.alvo, ativo: this.ativo };
  }
  parar() { this.ativo = false; if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; this._aquecendo = false; if (this._rafA) cancelAnimationFrame(this._rafA); this._rafA = 0; }
  continuar(mais) { if (this.ativo) return; this.alvo = Math.max(this.alvo, Math.floor(this.pt.samples) + (mais || 0)); this.ativo = true; const self = this; this._raf = requestAnimationFrame(function f() { if (!self.ativo) return; const t0 = performance.now(); do { self.pt.renderSample(); } while (self.pt.samples < self.alvo && performance.now() - t0 < 30); self._medir(); self.desenhar(); if (self.aoProgresso) self.aoProgresso(self.progresso()); if (self.pt.samples >= self.alvo) { self.ativo = false; return; } self._raf = requestAnimationFrame(f); }); }

  /* o fotômetro: média logarítmica da luminância das primeiras amostras (ISO 2720, K = 12,5) */
  medirExposicao() {
    const t = this.pt.target, w = t.width, h = t.height, px = new Float32Array(w * h * 4);
    try { this.renderer.readRenderTargetPixels(t, 0, 0, w, h, px); } catch (e) { return; }
    let s = 0, n = 0;
    const passo = Math.max(1, Math.floor(w * h / 40000)) * 4;
    for (let i = 0; i < px.length; i += passo) {
      const a = px[i + 3] || 1, L = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / a;
      if (!(L >= 0) || !isFinite(L)) continue;
      s += Math.log(1e-4 + L); n++;
    }
    if (!n) return;
    const Lm = Math.exp(s / n);
    this.exp.ev = Math.log2(Math.max(Lm, 1e-6) * 100 / 12.5);
    this.exp.medido = true;
  }
  definirExposicao(ev, comp) { if (ev == null) { this.exp.auto = true; this.exp.medido = false; } else { this.exp.auto = false; this.exp.ev = ev; this.exp.medido = true; } if (comp != null) this.exp.comp = comp; this.desenhar(); }
  definirTom(tom) { this.renderer.toneMapping = TOM[tom] || THREE.AgXToneMapping; this.desenhar(); }
  definirDenoise(on) { this.denoise = !!on; this.desenhar(); }
  definirBalanco(wb) { this.qExpor.material.uniforms.wb.value.set(wb[0], wb[1], wb[2], wb[3], wb[4], wb[5], wb[6], wb[7], wb[8]); this.desenhar(); }
  evEfetivo() { return this.exp.ev - (this.exp.comp || 0); }

  /* a tela: exposição → (denoise) → tom → sRGB */
  desenhar() {
    if (!this.rtLinear || !this.pt.samples) return;
    const r = this.renderer, ex = this.qExpor.material;
    ex.uniforms.map.value = this.pt.target.texture;
    ex.uniforms.exposicao.value = 1 / (1.2 * Math.pow(2, this.evEfetivo()));
    r.setRenderTarget(this.rtLinear); this.qExpor.render(r); r.setRenderTarget(null);
    if (this.denoise && this.pt.samples >= 2) { const sN = this.pt.samples; this.qDenoise.material.threshold = Math.min(0.3, Math.max(0.04, 0.5 * Math.sqrt(32 / sN)));   /* = RenderMat.limiarRuido */
      this.qDenoise.material.map = this.rtLinear.texture; this.qDenoise.material.uniforms.map.value = this.rtLinear.texture; this.qDenoise.render(r); }
    else { this.qSimples.material.map = this.rtLinear.texture; this.qSimples.material.needsUpdate = true; this.qSimples.render(r); }
  }

  /* liga/desliga luminárias sem refazer a cena (só as luzes e o acúmulo) */
  luzesLigadas(mapa) {
    Object.keys(this.luzes).forEach((id) => { if (Object.prototype.hasOwnProperty.call(mapa, id)) this.luzes[id].visible = !!mapa[id]; });
    if (this._cenaPronta) { this.pt.updateLights(); this.pt.reset(); }
  }
  imagem(tipo) { this.desenhar(); return this.canvas.toDataURL(tipo || 'image/png'); }
  /* o pixel final (sRGB 0–255) numa posição relativa (0..1, origem em cima à esquerda) — testes e conferência */
  pixel(fx, fy) {
    this.desenhar();
    const gl = this.renderer.getContext(), w = this.canvas.width, h = this.canvas.height;
    const x = Math.max(0, Math.min(w - 1, Math.round(fx * (w - 1)))), y = Math.max(0, Math.min(h - 1, Math.round((1 - fy) * (h - 1))));
    const b = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
    return [b[0], b[1], b[2]];
  }
  /* a radiância linear acumulada (cd/m², antes da câmera) num ponto — mede luz sem depender da exposição */
  radiancia(fx, fy, raio) {
    const t = this.pt.target, w = t.width, h = t.height, rr = Math.max(0, raio | 0);
    fx = Math.max(0, Math.min(1, fx)); fy = Math.max(0, Math.min(1, fy));
    const x0 = Math.max(0, Math.min(w - 1, Math.round(fx * (w - 1)) - rr)), y0 = Math.max(0, Math.min(h - 1, Math.round((1 - fy) * (h - 1)) - rr)), lw = Math.max(1, Math.min(w - x0, 2 * rr + 1)), lh = Math.max(1, Math.min(h - y0, 2 * rr + 1));
    const px = new Float32Array(lw * lh * 4); this.renderer.readRenderTargetPixels(t, x0, y0, lw, lh, px);
    const o = [0, 0, 0]; let n = 0;
    for (let i = 0; i < px.length; i += 4) { const a = px[i + 3] || 1; o[0] += px[i] / a; o[1] += px[i + 1] / a; o[2] += px[i + 2] / a; n++; }
    return o.map((v) => v / Math.max(1, n));
  }
  limparCena() {
    this.parar();
    const sc = this.scene;
    sc.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    sc.clear(); this.luzes = {}; this.sol = null;
    this.texturas.forEach((t) => t.dispose()); this.texturas = []; this._cacheTex = {};
    if (this._ceu) { this._ceu.dispose(); this._ceu = null; }
    sc.environment = null; sc.background = null;
    this._cenaPronta = false;
  }
  descartar() {
    this.limparCena();
    try { this.pt.dispose(); } catch (e) { /* já descartado */ }
    if (this.rtLinear) this.rtLinear.dispose();
    try { this.renderer.dispose(); this.renderer.forceContextLoss(); } catch (e) { /* contexto já perdido */ }
  }
}

/* o aparelho roda? WebGL 2 com alvo de cor em ponto flutuante (o acúmulo das amostras) */
export function suportado() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2');
    if (!gl) return { ok: false, motivo: 'Este navegador não tem WebGL 2.' };
    if (!gl.getExtension('EXT_color_buffer_float')) return { ok: false, motivo: 'A placa de vídeo deste aparelho não grava cor em ponto flutuante (EXT_color_buffer_float).' };
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return { ok: true };
  } catch (e) { return { ok: false, motivo: String(e && e.message || e) }; }
}
export const REVISAO_THREE = THREE.REVISION;

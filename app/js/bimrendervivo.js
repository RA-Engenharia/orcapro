/* =====================================================================
 * bimrendervivo.js — RENDER AO VIVO (módulo ES, protótipo 20/10/2026,
 * prévia `?previa=rendervivo`)
 *
 * Andar pelo modelo com a imagem de render: os materiais da biblioteca
 * física (js/rendermat.js), o sol e o céu da data e hora da obra, as
 * luminárias, sombras, luz rebatida, reflexo e espelho exato. Parou a
 * câmera, o path tracer (js/bimrendermotor.js) assume a MESMA vista e
 * converge até a foto física; mexeu, volta o tempo real.
 *
 * A pesquisa por trás (Unreal, Twinmotion, Enscape) está no RA Brain:
 * Pesquisas/2026-10-20 — Render em tempo real… e na página publicada.
 *
 * ⚠ MESMO THREE DO MOTOR (r186), lado WebGPU: three.webgpu.js e
 *   three.tsl.js usam o three.core.js da pasta do path tracer — um núcleo
 *   só na memória. O r150 do visualizador (js/bim.js) não atravessa: a
 *   cena chega como DADOS, os mesmos que o render físico recebe
 *   (BimRender._cenaDe), então a luz andando e a luz da foto são as mesmas
 *   grandezas — sol em lux, céu e painel em cd/m², spot em candela.
 *
 * ⚠ A EXPOSIÇÃO É A DO MOTOR: 1 / (1,2 × 2^EV), EV pelo fotômetro de luz
 *   refletida (ISO 2720, K = 12,5). Aqui o fotômetro mede a imagem do
 *   quadro (média logarítmica) e a câmera "adapta o olho" aos poucos, como
 *   ao entrar numa sala. A foto física recebe o MESMO EV: o brilho não
 *   pula quando ela assume.
 *
 * Pipeline por quadro (TSL, three r186):
 *   cena → MRT {cor, cor difusa, normal, velocidade, metal/rugosidade}
 *        → SSGI (luz rebatida + oclusão nos cantos)
 *        → SSR (reflexo de tela nos pisos, vidros e água)
 *        → TRAA (suavização temporal: as amostras dos quadros somam)
 *        → exposição × balanço de branco → bloom → curva de tom → sRGB
 *   Espelho: ReflectorNode — a cena redesenhada pelo ponto de vista
 *   refletido no plano do espelho (exato, inclusive o que está fora da tela).
 * ===================================================================== */
import * as CORE from '../bim/vendor/jsm/pathtracer/three/three.core.js';
import * as GPU from '../bim/vendor/jsm/pathtracer/three/three.webgpu.js';
import {
  pass, mrt, output, normalView, diffuseColor, velocity, metalness, roughness, vec2, vec3, vec4, add,
  sample, packNormalToRGB, unpackRGBToNormal, uniform, reflector, float, max,
  texture3D, positionWorld, normalWorld, select, mix, clamp, floor, step, normalize, dot, smoothstep,
  texture, uv, mx_fractal_noise_float
} from '../bim/vendor/jsm/pathtracer/three/three.tsl.js';
import { calcular as calcularLuz, albedoDe } from './bimluzobra.js';
import * as LUZCACHE from './bimluzcache.js';   /* [frente E3] cache da luz calculada (IndexedDB) */
import { LuzAssada } from './bimluzassada.js';
import { ReflexoObra } from './bimreflexo.js';   /* [frente R] reflexos: sonda por cômodo + piso planar */
import { Mat2K } from './bimmat2k.js';   /* [frente G] materiais 2K com relevo */
import { adicionarVersos } from './bimverso.js';   /* [frente E2] o verso só das peças abertas */
import { CircuitosNos, Circuitos } from './bimluzcircuitos.js';   /* [frente I] interruptores vivos: luz assada por comando */
import { ObjetosCena } from './bimcenaobjsmotor.js';   /* [Cena: objetos] móveis, luminárias e vegetação arrastados para a cena */
import { EfeitosCena } from './bimcenaefeitos.js';   /* [Cena: efeitos] raios de sol, vento, água em movimento */
import * as TSLTUDO from '../bim/vendor/jsm/pathtracer/three/three.tsl.js';   /* [frente G] o TSL inteiro para o grafo do bimmat2k.js */
import { ssgi } from '../bim/vendor/jsm/pathtracer/three/addons/tsl/display/SSGINode.js';
import { ssr } from '../bim/vendor/jsm/pathtracer/three/addons/tsl/display/SSRNode.js';
import { traa } from '../bim/vendor/jsm/pathtracer/three/addons/tsl/display/TRAANode.js';
import { bloom } from '../bim/vendor/jsm/pathtracer/three/addons/tsl/display/BloomNode.js';
import { RectAreaLightTexturesLib } from '../bim/vendor/jsm/pathtracer/three/addons/lights/RectAreaLightTexturesLib.js';

/* o three.webgpu.js reexporta só parte do núcleo (falta DataUtils, ImageLoader, Box3, Spherical…): os dois juntos */
const THREE = Object.assign({}, CORE, GPU);
const TOM = { agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutro: THREE.NeutralToneMapping };

/* [frente E3] FOTO DA TELA DO VIDRO, UMA POR ALVO. O vidro (transmissão) lê a cena opaca de uma cópia do quadro (ViewportTextureNode):
   o three guarda uma textura-cópia por alvo de desenho (a tela, o refletor do piso, o do espelho…) — mas cada uma é um CLONE da
   primeira, e Texture.clone() reparte a mesma `source` (a mesma imagem {width,height}). Com alvos de tamanhos diferentes (tela 1631×740,
   piso 816×370, espelho…) cada cópia mudava o tamanho da imagem repartida e as outras se achavam desatualizadas: a textura era
   DESTRUÍDA e recriada duas vezes por quadro (medido 21/10/2026: 322 de cada tamanho em 17 s) e, quando um comando já gravado ainda
   a citava, o envio inteiro caía com "Destroyed texture [816x370 RGBA16Float] used in a submit" SEM erro de JS. Cada clone ganha
   a sua própria `source`: o tamanho de um alvo não mexe no do outro, e a textura só é refeita quando o alvo muda de verdade. */
(function fotoDaTelaPorAlvo() {
  const VTN = THREE.ViewportTextureNode;
  if (!VTN || VTN.prototype.__raPorAlvo || (typeof window !== 'undefined' && window.RA_SEM_FOTO_POR_ALVO)) return;   /* RA_SEM_FOTO_POR_ALVO: só para a medida do ANTES */
  VTN.prototype.__raPorAlvo = true;
  const original = VTN.prototype.getTextureForReference;
  VTN.prototype.getTextureForReference = function (ref) {
    const t = original.call(this, ref);
    if (ref !== null && ref !== undefined && t && t.userData && !t.userData.raPropria) {
      const base = (this.referenceNode || this).defaultFramebuffer;
      if (t !== base && t.source === (base && base.source)) t.source = new THREE.Source({ width: t.image.width, height: t.image.height });
      t.userData.raPropria = true;
    }
    return t;
  };
})();

/* QUALIDADE: o que cada degrau liga. "ultra" é a placa de vídeo dedicada (RTX); "leve" é notebook/celular. */
export const QUALIDADES = {
  leve:  { nome: 'Leve',  escala: 0.75, sombra: 2048, giFatias: 1, giPassos: 8,  ssr: false, espelho: 0.5, aniso: 4, luzPasso: 0.7, luzRaios: 48 },
  alta:  { nome: 'Alta',  escala: 1.0,  sombra: 4096, giFatias: 2, giPassos: 12, ssr: true,  espelho: 0.75, aniso: 8, luzPasso: 0.5, luzRaios: 96 },
  ultra: { nome: 'Ultra', escala: 1.0,  sombra: 8192, giFatias: 3, giPassos: 16, ssr: true,  espelho: 1.0, aniso: 16, luzPasso: 0.4, luzRaios: 128 }
};

function corLin(c) { return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace); }
const MAX_MEIO = 65000;   /* teto do meio-float (o céu vai à placa em 16 bits) */
const EV_NOITE_MIN = 2.5;   /* [frente I] piso do fotômetro sem sol (ver _medir) */

/* ---------------------------------------------------------------------
 * A LUZ DA OBRA NO MATERIAL (js/bimluzobra.js calcula): o ambiente do
 * three continua dando o REFLEXO do céu, mas (1) a parte DIFUSA passa a
 * vir das sondas — o céu e o sol rebatido que de fato chegam ali — e
 * (2) o reflexo do céu é atenuado onde o céu não é visível (dentro de
 * casa o piso polido não espelha o céu aberto). uAtiva = 0 até o cálculo
 * terminar: até lá vale o ambiente puro, sem recompilar nada depois.
 * --------------------------------------------------------------------- */
class LuzObraNos {
  constructor() {
    const vazio = () => { const t = new THREE.Data3DTexture(new Uint16Array(2 * 2 * 2 * 4), 2, 2, 2); t.format = THREE.RGBAFormat; t.type = THREE.HalfFloatType; t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; t.userData.vazio = true; return t; };
    this.tex = [0, 1, 2, 3, 4, 5].map(vazio); this._vazios = this.tex.slice();   /* [frente R] */
    this.uOrig = uniform(new THREE.Vector3()); this.uInv = uniform(1); this.uN = uniform(new THREE.Vector3(2, 2, 2));
    this.uAtiva = uniform(0); this.uK = uniform(1);
    /* TRILINEAR À MÃO, pesada pelo LADO da face e só nas sondas válidas (alfa ≥ 0) — ver o cabeçalho do bimluzobra.js
       (a filtragem linear da placa misturaria a sonda de trás da parede). 8 cantos × 3 faces do cubo = 24 leituras. */
    /* a grade é lida meio passo à frente da face; o LADO é medido do ponto da própria face: sonda atrás do plano dela pesa zero
       (com o lado medido do ponto deslocado, a sonda do sótão vazava de viés e o forro saía de bolinhas — 20/10/2026) */
    const n = normalWorld, n2 = n.mul(n), S = positionWorld, P = S.add(n.mul(this.uMeio = uniform(0.2)));
    const f = P.sub(this.uOrig).mul(this.uInv);
    const i0 = clamp(floor(f), vec3(0), this.uN.sub(2)), t = clamp(f.sub(i0), 0, 1);
    this.nos = [[], [], [], [], [], []];
    let sE = vec3(0), sV = float(0), sW = float(0);
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1, idx = i0.add(vec3(dx, dy, dz)), uvw = idx.add(0.5).div(this.uN);
      const s = this.tex.map((tx, e) => { const no = texture3D(tx, uvw); this.nos[e].push(no); return no; });
      const sx = select(n.x.greaterThanEqual(0), s[0], s[1]), sy = select(n.y.greaterThanEqual(0), s[2], s[3]), sz = select(n.z.greaterThanEqual(0), s[4], s[5]);
      const wt = (dx ? t.x : t.x.oneMinus()).mul(dy ? t.y : t.y.oneMinus()).mul(dz ? t.z : t.z.oneMinus());
      const v = normalize(this.uOrig.add(idx.div(this.uInv)).sub(S)), lado = smoothstep(0.02, 0.35, dot(v, n));
      const w = wt.mul(step(0, sx.a)).mul(lado);
      sE = sE.add(sx.rgb.mul(n2.x).add(sy.rgb.mul(n2.y)).add(sz.rgb.mul(n2.z)).mul(w));
      sV = sV.add(max(sx.a.mul(n2.x).add(sy.a.mul(n2.y)).add(sz.a.mul(n2.z)), 0).mul(w));
      sW = sW.add(w);
    }
    const inv = float(1).div(max(sW, 1e-4));
    /* onde nenhuma sonda válida alcança (fora da grade, frestas), vale o ambiente puro */
    this.peso = this.uAtiva.mul(smoothstep(0, 0.02, sW));
    this.E = sE.mul(inv).mul(1000).mul(this.uK);   /* klux → lux, pré-exposto */
    this.vis = sV.mul(inv);
    this.oclusao = mix(float(1), clamp(this.vis.mul(1.6).add(0.06), 0, 1), this.peso);
  }
  carregar(r) {
    const [nx, ny, nz] = r.n, N = nx * ny * nz;
    r.faces.forEach((f, e) => {
      const h = new Uint16Array(N * 4);
      for (let i = 0; i < N * 4; i++) { const c = i & 3; h[i] = THREE.DataUtils.toHalfFloat(Math.min(65000, c === 3 ? f[i] : f[i] / 1000)); }
      /* [frente R] MESMA textura, dados novos (mesma grade): trocar o OBJETO deixava desenhos fora da tela principal (refletor,
         sonda de reflexo) presos à textura velha — descartada 3 s depois, o envio inteiro caía ("Destroyed texture") */
      const at = this.tex[e];
      if (!at.userData.vazio && at.image.width === nx && at.image.height === ny && at.image.depth === nz) { at.image.data = h; at.needsUpdate = true; return; }
      const t = new THREE.Data3DTexture(h, nx, ny, nz); t.format = THREE.RGBAFormat; t.type = THREE.HalfFloatType;
      t.minFilter = t.magFilter = THREE.NearestFilter; t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
      const velho = this.tex[e]; this.tex[e] = t; this.nos[e].forEach((no) => { no.value = t; });
      /* ⚠ descartar DEPOIS: um quadro já gravado ainda usa a textura velha ("Destroyed texture used in a submit") */
      /* [frente R] a textura VAZIA (2×2×2) não é descartada aqui: um desenho que ainda não tinha passado pela troca (a face
         da sonda de reflexo, compilada antes da luz chegar) seguia com ela e o envio inteiro caía ("Destroyed texture
         [2x2x2] used in a submit") — as sondas de reflexo saíam todas iguais (20/10/2026); some no descartar() */
      if (!velho.userData.vazio) setTimeout(() => { try { velho.dispose(); } catch (x) { /* já descartado */ } }, 3000);
    });
    this.uOrig.value.fromArray(r.origem); this.uInv.value = 1 / r.passo; this.uMeio.value = r.passo * 0.5; this.uN.value.set(nx, ny, nz); this.uAtiva.value = 1;
  }
  descartar() { this.tex.forEach((t) => { try { t.dispose(); } catch (e) { /* já descartado */ } }); (this._vazios || []).forEach((t) => { try { t.dispose(); } catch (e) { /* já */ } }); }
}
/* ---------------------------------------------------------------------
 * A LUZ ASSADA NO MATERIAL (js/bimluzassada.js calcula): onde a malha tem
 * o atributo uv1 (ganhou pedaço do atlas), a irradiância difusa vem do
 * atlas — a ~3 cm, com o canto e a faixa de sol rebatido — no lugar da
 * sonda; o alfa do atlas é a fração de céu visível (tira o reflexo do céu
 * de dentro de casa). Sem uv1 (vidro, folhagem, terreno), segue a sonda.
 * A troca de atlas é só de textura (node.value): nada recompila.
 * --------------------------------------------------------------------- */
class LuzAssadaNos {
  constructor(uK, circ) {
    this._vazia = new THREE.DataTexture(new Uint16Array([0, 0, 0, THREE.DataUtils.toHalfFloat(-1)]), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    this._vazia.minFilter = this._vazia.magFilter = THREE.LinearFilter; this._vazia.needsUpdate = true;
    this.tex = this._vazia; this.uAtiva = uniform(0);
    this.no = texture(this.tex, uv(1));
    const a = this.no.a;
    /* alfa −1 = texel sem dado (fora de todo pedaço): pesa zero */
    this.peso = this.uAtiva.mul(clamp(a.mul(4).add(1), 0, 1)).mul(step(0, uv(1).x));
    this.E = (circ ? this.no.rgb.add(circ.E) : this.no.rgb).mul(1000).mul(uK);   /* klux → lux, pré-exposto (o mesmo k das sondas); [frente I] + os comandos acesos */
    this.oc = clamp(a.mul(1.6).add(0.06), 0, 1);
  }
  carregar(at) {
    /* [frente R] mesma textura, dados novos (rápida → completa, hora nova): ver LuzObraNos.carregar */
    const ve = this.tex;
    if (ve !== this._vazia && ve.image.width === at.largura && ve.image.height === at.altura) { ve.image.data = at.dados; ve.needsUpdate = true; this.uAtiva.value = 1; return; }
    const t = new THREE.DataTexture(at.dados, at.largura, at.altura, THREE.RGBAFormat, THREE.HalfFloatType);
    t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    const velho = this.tex; this.tex = t; this.no.value = t; this.uAtiva.value = 1;
    /* ⚠ descartar DEPOIS: um quadro já gravado ainda usa a textura velha (a mesma regra das sondas) */
    if (velho !== this._vazia) setTimeout(() => { try { velho.dispose(); } catch (x) { /* já descartado */ } }, 3000);
  }
  descartar() { [this.tex, this._vazia].forEach((t) => { try { t.dispose(); } catch (e) { /* já descartado */ } }); this.tex = this._vazia; }
}

class AmbienteComLuzObra extends THREE.EnvironmentNode {
  constructor(envNode, luz, assada) { super(envNode); this.luz = luz; this.assada = assada; }
  setup(builder) {
    super.setup(builder);
    const L = this.luz, A = this.assada, ctx = builder.context, geo = builder.geometry;
    const temAtlas = !!(A && geo && geo.getAttribute && geo.getAttribute('uv1'));
    let E = mix(ctx.iblIrradiance, L.E, L.peso), oc = L.oclusao;
    if (temAtlas) { E = mix(E, A.E, A.peso); oc = mix(oc, A.oc, A.peso); }
    ctx.iblIrradiance.assign(E);
    ctx.radiance.mulAssign(oc);
    const cc = ctx.lightingModel && ctx.lightingModel.clearcoatRadiance; if (cc) cc.mulAssign(oc);
    /* [frente R] dentro do cômodo o reflexo vem da sonda dele (caixa) e, no piso grande, do plano exato — js/bimreflexo.js */
    if (this.reflexo) this.reflexo.aplicar(builder, ctx, oc);
  }
}

/* ---------------------------------------------------------------------
 * A NAVEGAÇÃO: órbita (girar, mover, aproximar) e caminhar (W A S D +
 * arrastar para olhar), sem trava de ponteiro — funciona em qualquer tela.
 * --------------------------------------------------------------------- */
class Navegacao {
  constructor(camera, el, aoMexer) {
    this.cam = camera; this.el = el; this.aoMexer = aoMexer;
    this.alvo = new THREE.Vector3(); this.modo = 'orbita';
    this.teclas = {}; this.vel = 1.4; this._arr = null;
    this._sph = new THREE.Spherical();
    const ev = (n, f, o) => { el.addEventListener(n, f, o); (this._ev = this._ev || []).push([el, n, f, o]); };
    const evw = (n, f) => { window.addEventListener(n, f); this._ev.push([window, n, f]); };
    ev('contextmenu', (e) => e.preventDefault());
    ev('pointerdown', (e) => { el.setPointerCapture(e.pointerId); this._arr = { x: e.clientX, y: e.clientY, b: e.button, sh: e.shiftKey }; });
    ev('pointerup', (e) => { try { el.releasePointerCapture(e.pointerId); } catch (x) { /* já solto */ } this._arr = null; });
    ev('pointermove', (e) => {
      if (!this._arr) return;
      const dx = e.clientX - this._arr.x, dy = e.clientY - this._arr.y; this._arr.x = e.clientX; this._arr.y = e.clientY;
      if (this.modo === 'caminhar' || (this._arr.b === 0 && !this._arr.sh)) this._girar(dx, dy); else this._mover(dx, dy);
      this.aoMexer();
    });
    ev('wheel', (e) => { e.preventDefault(); this._aproximar(e.deltaY); this.aoMexer(); }, { passive: false });
    evw('keydown', (e) => { if (/input|select|textarea/i.test((e.target && e.target.tagName) || '')) return; this.teclas[e.code] = true; });
    evw('keyup', (e) => { this.teclas[e.code] = false; });
    evw('blur', () => { this.teclas = {}; });
  }
  olhar(pos, alvo) { this.cam.position.copy(pos); this.alvo.copy(alvo); this.cam.up.set(0, 1, 0); this.cam.lookAt(this.alvo); this.cam.updateMatrixWorld(); }
  _girar(dx, dy) {
    const k = 0.005;
    if (this.modo === 'caminhar') {
      /* gira a cabeça: o alvo anda em volta da câmera */
      const d = this.alvo.clone().sub(this.cam.position); this._sph.setFromVector3(d);
      this._sph.theta -= dx * k; this._sph.phi = Math.min(Math.PI - 0.05, Math.max(0.05, this._sph.phi + dy * k));
      this.alvo.copy(this.cam.position).add(new THREE.Vector3().setFromSpherical(this._sph));
    } else {
      const d = this.cam.position.clone().sub(this.alvo); this._sph.setFromVector3(d);
      this._sph.theta -= dx * k; this._sph.phi = Math.min(Math.PI - 0.03, Math.max(0.03, this._sph.phi - dy * k));
      this.cam.position.copy(this.alvo).add(new THREE.Vector3().setFromSpherical(this._sph));
    }
    this.cam.lookAt(this.alvo); this.cam.updateMatrixWorld();
  }
  _mover(dx, dy) {
    const dist = this.cam.position.distanceTo(this.alvo), s = dist * 2 * Math.tan(this.cam.fov * Math.PI / 360) / Math.max(1, this.el.clientHeight);
    const dir = new THREE.Vector3(), dx3 = new THREE.Vector3(), dy3 = new THREE.Vector3();
    this.cam.matrixWorld.extractBasis(dx3, dy3, dir);
    const t = dx3.multiplyScalar(-dx * s).add(dy3.multiplyScalar(dy * s));
    this.cam.position.add(t); this.alvo.add(t); this.cam.updateMatrixWorld();
  }
  _aproximar(dy) {
    const d = this.cam.position.clone().sub(this.alvo), f = Math.pow(1.0015, dy);
    if (this.modo === 'caminhar') { const fr = this.alvo.clone().sub(this.cam.position).normalize().multiplyScalar(-dy * 0.004); this.cam.position.add(fr); this.alvo.add(fr); }
    else { const nd = Math.max(0.3, d.length() * f); this.cam.position.copy(this.alvo).add(d.setLength(nd)); }
    this.cam.updateMatrixWorld();
  }
  /* passo por quadro do caminhar (teclas) — devolve true se mexeu */
  passo(dt) {
    const T = this.teclas, fr = (T.KeyW || T.ArrowUp ? 1 : 0) - (T.KeyS || T.ArrowDown ? 1 : 0), la = (T.KeyD || T.ArrowRight ? 1 : 0) - (T.KeyA || T.ArrowLeft ? 1 : 0), su = (T.KeyE ? 1 : 0) - (T.KeyQ ? 1 : 0);
    if (!fr && !la && !su) return false;
    const v = this.vel * (T.ShiftLeft || T.ShiftRight ? 3 : 1) * dt;
    const f = this.alvo.clone().sub(this.cam.position); f.y = 0; if (f.lengthSq() < 1e-9) f.set(0, 0, -1); f.normalize();
    const d = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const m = f.multiplyScalar(fr * v).add(d.multiplyScalar(la * v)).add(new THREE.Vector3(0, su * v, 0));
    this.cam.position.add(m); this.alvo.add(m); this.cam.lookAt(this.alvo); this.cam.updateMatrixWorld();
    return true;
  }
  descartar() { (this._ev || []).forEach(([o, n, f, op]) => o.removeEventListener(n, f, op)); this._ev = []; }
}

/* =====================================================================
 * O MOTOR AO VIVO
 * ===================================================================== */
export class RenderVivo {
  /* palco: o elemento que recebe o canvas (posição relativa/absoluta) */
  constructor(palco, opcoes) {
    this.palco = palco; this.o = opcoes || {};
    this.qual = QUALIDADES[this.o.qualidade] || QUALIDADES.alta;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none';
    this.canvas.tabIndex = 0;
    palco.appendChild(this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
    this.camera.layers.enable(1);   /* [frente P] camada 1 = o entorno (grama e árvores): a câmera vê as duas; o piso planar reflete só a 0 (js/bimreflexo.js limitar) */
    this.texturas = []; this._cacheTex = {}; this.espelhos = []; this.luzes = {};
    this.ev = 12; this.evAlvo = 12; this.comp = 0; this.evAuto = true; this._medindo = false;
    this.uExpo = uniform(1); this.uWB = uniform(new THREE.Matrix3()); this.uGI = uniform(1);
    this.luz = new LuzObraNos(); this.luzInfo = null;
    this.circ = new CircuitosNos();   /* [frente I] */
    this.objetos = new ObjetosCena(this);   /* [Cena: objetos] */
    this.efeitos = new EfeitosCena(this);   /* [Cena: efeitos] */
    this.lm = new LuzAssadaNos(this.luz.uK, this.circ); this.assada = null; this.assadaInfo = null; this.uvInfo = null;
    /* com o atlas ativo, a luz de tela (SSGI) entra só como detalhe: o rebote e o canto já estão no atlas */
    this.ajusteLM = { ao: 0.3, gi: 0 };
    this.estado = { fase: 'iniciando', qps: 0, refino: null };
    /* [frente R] */ this.reflexo = new ReflexoObra(this, Object.keys(QUALIDADES).find((k) => QUALIDADES[k] === this.qual) || 'alta', this.o.reflexo === false);
    this._ultimoMov = performance.now(); this._qT = []; this._quadros = 0;
    this.aoEstado = null;
  }

  async iniciar() {
    if (!navigator.gpu) throw new Error('Este navegador não tem WebGPU. Use o Chrome ou o Edge atualizados no computador.');
    /* [frente I] o material do Ultra encosta no teto de 16 texturas por estágio que o WebGPU garante: pede o que a placa der (até 32) */
    let lim = {}; try { const ad = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }), m = ad && ad.limits && ad.limits.maxSampledTexturesPerShaderStage; if (m > 16) lim = { maxSampledTexturesPerShaderStage: Math.min(32, m) }; this.limiteTexturas = m || 16; } catch (e) { /* o padrão */ }
    const r = this.renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', trackTimestamp: this.o.medirGpu === true /* [frente F] */, requiredLimits: lim });
    await r.init();
    if (!r.backend || !r.backend.isWebGPUBackend) throw new Error('A placa de vídeo não liberou o WebGPU para o navegador (caiu no WebGL). Atualize o driver ou o navegador.');
    THREE.RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
    r.outputColorSpace = THREE.SRGBColorSpace;
    /* ACES por padrão: na comparação de 20/10/2026 (Casa 487) foi a única com contraste e cor de foto; AgX lavava, Neutra escurecia */
    r.toneMapping = TOM[this.o.tom] || THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;   /* o WebGPU do r186 não tem mais o PCFSoft: a suavidade vem do shadow.radius */
    this._redimensionar();
    this._ro = new ResizeObserver(() => this._redimensionar()); this._ro.observe(this.palco);
    this.nav = new Navegacao(this.camera, this.canvas, () => this.mexeu());
    this.aniso = Math.min(this.qual.aniso, (r.getMaxAnisotropy && r.getMaxAnisotropy()) || 16);
    /* [frente G] materiais 2K: leve = nenhum 2K; alta/ultra baixam só o 2K do que a cena usa, dentro do teto de memória */
    this.mat2k = this.o.mat2k === false ? null : new Mat2K({ THREE, TSL: TSLTUDO, qualidade: Object.keys(QUALIDADES).find((k) => QUALIDADES[k] === this.qual) || 'alta', aniso: this.aniso, anisoMax: (r.getMaxAnisotropy && r.getMaxAnisotropy()) || 16 });
    this.adaptador = await this._infoAdaptador();
    return this;
  }
  async _infoAdaptador() {
    try { const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); const i = a && (a.info || (a.requestAdapterInfo && await a.requestAdapterInfo())); return i ? [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' ') : ''; } catch (e) { return ''; }
  }
  _redimensionar() {
    const w = Math.max(2, this.palco.clientWidth), h = Math.max(2, this.palco.clientHeight);
    const pr = Math.min(window.devicePixelRatio || 1, 2) * this.qual.escala * (this.escalaDin || 1) * (this.escalaSaida || 1);   /* [Cena] escalaDin: o controlador de fluidez; escalaSaida: a foto em alta */
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.mexeu();
  }

  /* [Cena] RESOLUÇÃO DINÂMICA: 0,5..1 do pixel da qualidade. Muda só o tamanho do desenho (sem recompilar nada) — é o primeiro
     degrau do controlador de fluidez (BimCena.Controlador) antes de trocar de nível */
  escalaDinamica(f) {
    const n = Math.max(0.4, Math.min(1, +f || 1));
    if (Math.abs(n - (this.escalaDin || 1)) < 1e-3) return this.escalaDin || 1;
    this.escalaDin = n; if (this.renderer) this._redimensionar();
    return n;
  }
  /* --------------------------------------------------------- materiais (os mesmos números do motor físico) */
  _textura(url, srgb) {
    if (!url) return null;
    if (!this._cacheTex[url]) {
      const t = new THREE.Texture();
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = this.aniso;
      this._pend.push(new THREE.ImageLoader().loadAsync(url).then((img) => { t.image = img; t.needsUpdate = true; }, () => { t.userData.erro = true; }));
      this._cacheTex[url] = t; this.texturas.push(t);
    }
    return this._cacheTex[url];
  }
  _texDados(px, w, h, srgb) {
    const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = this.aniso; t.needsUpdate = true;
    this.texturas.push(t);
    return t;
  }
  _material(p) {
    const vidro = p.transmissao > 0;
    const m = new THREE.MeshPhysicalNodeMaterial({
      color: corLin(p.cor), roughness: p.rugosidade, metalness: p.metalicidade, ior: p.ior,
      clearcoat: p.clearcoat || 0, clearcoatRoughness: p.clearcoatRugosidade || 0,
      sheen: p.sheen || 0, sheenColor: corLin(p.sheenCor || [1, 1, 1]), sheenRoughness: p.sheenRugosidade || 0.5,
      side: vidro ? THREE.DoubleSide : THREE.FrontSide,
      /* ⚠ SOMBRA PELOS DOIS LADOS: o padrão do three desenha no mapa de sombra só o lado de TRÁS de material FrontSide —
         o telhado (superfície de um lado só, virada para cima) não fazia sombra e o sol entrava na casa: o estar saía
         2,2 × mais claro que a foto física (20/10/2026). O path tracer trata tudo como opaco dos dois lados. */
      shadowSide: THREE.DoubleSide
    });
    if (vidro) {
      /* vidro e água: transmissão física (a cena atrás aparece pelo vidro, com o reflexo de Fresnel na frente) */
      m.transmission = p.transmissao; m.thickness = p.espessuraVolume || 0;
      if (p.atenuacao && p.espessuraVolume > 0) { m.attenuationColor = corLin(p.atenuacao.cor); m.attenuationDistance = p.atenuacao.distancia; }
    }
    const tx = p.textura;
    if (tx && tx.tipo === 'cc0' && tx.arquivos) {
      const rep = [1 / tx.escala, 1 / (tx.escala * (tx.asp || 1))];
      const ap = (t) => { if (!t) return null; const c = t.clone(); c.repeat.set(rep[0], rep[1]); c.anisotropy = this.aniso; c.needsUpdate = true; this.texturas.push(c); return c; };
      m.map = ap(this._textura(tx.arquivos.cor, true));
      if (p.relevo > 0 && tx.arquivos.normal) { m.normalMap = ap(this._textura(tx.arquivos.normal, false)); m.normalScale.set(p.relevo, p.relevo); }
      if (tx.arquivos.rugosidade) { m.roughnessMap = ap(this._textura(tx.arquivos.rugosidade, false)); }
      if (tx.tinta) m.color = corLin(tx.tinta);
    } else if (tx && tx.tipo === 'imagem' && tx.imagem) {
      const t = new THREE.Texture(tx.imagem); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = this.aniso;
      t.repeat.set(tx.repeat[0], tx.repeat[1]); t.offset.set(tx.offset[0], tx.offset[1]); t.needsUpdate = true; this.texturas.push(t);
      m.map = t;
    } else if (tx && tx.tipo === 'rejunte' && tx.mapas && !(this.mat2k && this.mat2k.querRejunte(p))) {   /* [frente T] o rejunte analítico do bimmat2k.js dispensa estas 3 texturas de 1024 px */
      const g = tx.mapas, rep = [1 / g.repeticao[0], 1 / g.repeticao[1]];
      const cor = this._texDados(g.cor, g.largura, g.altura, true), msk = this._texDados(g.mascara, g.largura, g.altura, false), nor = this._texDados(g.normal, g.largura, g.altura, false);
      [cor, msk, nor].forEach((t) => t.repeat.set(rep[0], rep[1]));
      m.map = cor; m.roughnessMap = msk; m.roughness = 1; m.clearcoatMap = p.clearcoat > 0 ? msk : null;
      if (p.relevo > 0) { m.normalMap = nor; m.normalScale.set(p.relevo * 2, p.relevo * 2); }
    }
    /* [frente G] 2K: o grafo (cor/normal/ORM/paralaxe/variação) nasce ligado ao 1K acima; o 2K entra depois trocando value */
    if (this.mat2k) this.mat2k.registrar(m, p, (u, s) => this._textura(u, s));
    m.userData.id = p.id;
    if (p.id === 'agua' && this.efeitos) this.efeitos.prepararAgua(m);   /* [Cena: efeitos] água em movimento (amplitude 0 = lisa como antes) */
    /* ANTI-REPETIÇÃO do chão: a textura de 2 m vista de longe vira a cor média (mipmap) e o gramado fica chapado.
       Uma variação de cor em escala de dezenas de metros (ruído fractal no mundo) dá o gramado "de verdade". */
    if ((p.id === 'grama' || p.id === 'terra') && m.map && !m.userData.mat2k) {   /* [frente G] com o 2K o bimmat2k.js refaz este mesmo ruído */
      const var1 = mx_fractal_noise_float(positionWorld.xz.mul(0.045), 3, 2.0, 0.5).mul(0.5).add(0.5);
      const var2 = mx_fractal_noise_float(positionWorld.xz.mul(0.35), 2, 2.0, 0.5).mul(0.5).add(0.5);
      m.colorNode = texture(m.map, uv()).rgb.mul(m.color).mul(mix(0.72, 1.2, var1)).mul(mix(0.9, 1.08, var2));
    }
    /* a luz indireta das sondas (e a do atlas, onde a malha tem uv1) no lugar do céu genérico (ver LuzObraNos e LuzAssadaNos) */
    const luz = this.luz, lm = this.lm, rf = this.reflexo;   /* [frente R] rf */
    m.setupEnvironment = function (builder) {
      const env = THREE.MeshPhysicalNodeMaterial.prototype.setupEnvironment.call(this, builder);
      if (!(env instanceof THREE.EnvironmentNode)) return env;
      const a = new AmbienteComLuzObra(env.envNode, luz, lm); a.reflexo = rf; return a;   /* [frente R] */
    };
    return m;
  }

  /* ESPELHO EXATO: os triângulos do grupo "espelho" separados por plano; cada plano (os maiores, até o teto
     da qualidade) ganha um refletor — a cena redesenhada do ponto de vista espelhado. */
  _espelhos(geo, matBase) {
    const pos = geo.getAttribute('position'), idx = geo.index, n = idx ? idx.count : pos.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    const planos = [];
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
      e1.subVectors(b, a); e2.subVectors(c, a); nn.crossVectors(e1, e2); const ar = nn.length() / 2; if (ar < 1e-6) continue;
      nn.normalize(); const d = nn.dot(a);
      let pl = planos.find((q) => q.n.dot(nn) > 0.999 && Math.abs(q.d - d) < 0.004);
      if (!pl) { pl = { n: nn.clone(), d, area: 0, tri: [], c: new THREE.Vector3() }; planos.push(pl); }
      pl.area += ar; pl.tri.push(ia, ib, ic); pl.c.add(a).add(b).add(c);
    }
    planos.sort((p, q) => q.area - p.area);
    const teto = this.qual.espelho >= 1 ? 4 : 2, feitos = [];
    planos.forEach((pl, k) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', pos); if (geo.getAttribute('normal')) g.setAttribute('normal', geo.getAttribute('normal')); if (geo.getAttribute('uv')) g.setAttribute('uv', geo.getAttribute('uv'));
      g.setIndex(pl.tri);
      let mat = matBase;
      if (k < teto && pl.area > 0.05) {
        const refl = reflector({ resolutionScale: this.qual.espelho, generateMipmaps: false, bounces: false });
        const centro = pl.c.multiplyScalar(1 / pl.tri.length);
        refl.target.position.copy(centro).addScaledVector(pl.n, 0.0005);
        refl.target.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pl.n);
        refl.target.updateMatrixWorld();
        this.scene.add(refl.target);
        /* [frente P] o espelho só redesenha a cena quando está no campo de visão e algo mudou (js/bimreflexo.js limitar) */
        { const bx = new THREE.Box3(), pv = new THREE.Vector3(); for (let q = 0; q < pl.tri.length; q++) bx.expandByPoint(pv.fromBufferAttribute(pos, pl.tri[q])); this.reflexo.limitar(refl, bx.expandByScalar(0.4)); }
        mat = new THREE.MeshStandardNodeMaterial({ color: 0x000000, roughness: 1, metalness: 0, shadowSide: THREE.DoubleSide });
        /* prata do espelho comum: refletância ~0,9 (vidro float + prata) */
        mat.emissiveNode = refl.rgb.mul(0.9);
        mat.userData.id = 'espelho';
        this.espelhos.push({ refl, mat, area: pl.area });
      }
      const ms = new THREE.Mesh(g, mat); ms.castShadow = true; ms.receiveShadow = true; ms.userData.espelho = mat !== matBase;
      this.scene.add(ms); feitos.push(ms);
    });
    return feitos;
  }

  /* monta a cena a partir dos DADOS (BimRender._cenaDe) */
  async preparar(cena) {
    this.limparCena();
    this._pend = [];
    if (this.mat2k) { this.mat2k.nova(); await this.mat2k.carregarManifesto(); }   /* [frente G] */
    const sc = this.scene;
    const mats = (cena.materiais || []).map((p) => this._material(p));
    this._cenaMats = { mats, params: cena.materiais || [] }; this._origemCena = cena.origem || [0, 0, 0];   /* [Cena: objetos] os materiais da cena (reaproveitados por objeto da mesma pintura) e a origem BIM → motor */
    const caixa = new THREE.Box3(), casa = new THREE.Box3();
    let tri = 0;
    (cena.grupos || []).forEach((g) => {
      if (!g.pos || !g.pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
      if (g.idx) geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
      geo.computeBoundingBox(); caixa.union(geo.boundingBox);
      /* a caixa da CASA (sem o terreno de centenas de metros): é ela que a sombra do sol enquadra */
      { const dg = geo.boundingBox.getSize(new THREE.Vector3()); if (Math.max(dg.x, dg.z) < 120) casa.union(geo.boundingBox); }
      tri += (g.idx ? g.idx.length : g.pos.length / 3) / 3;
      const m = mats[g.mat] || mats[0];
      if (m && m.userData.id === 'espelho') { this._espelhos(geo, m); return; }
      /* [frente R] piso brilhante: separado por plano depois do laço (os maiores ganham o reflexo planar) */
      if (this.reflexo.pegarPiso(geo, m, (cena.materiais || [])[g.mat])) return;
      if (m && m.userData.mat2kAniso && this.mat2k) this.mat2k.tangentes(geo);   /* [frente T] metal escovado: a tangente da projeção planar */
      const ms = new THREE.Mesh(geo, m);
      if (g.cortina && this.efeitos) this.efeitos.prepararCortina(ms, m);   /* [Cena: efeitos] tecido que balança com o vento */
      ms.castShadow = !(m && m.transmission > 0); ms.receiveShadow = true;
      sc.add(ms);
    });
    this.caixa = caixa; this.caixaCasa = casa.isEmpty() ? caixa : casa;
    /* [frente R] */ this.reflexo.montarPisos(sc);
    /* [frente E2] o VERSO só das peças ABERTAS (parede só com uma face, película, telhado de um lado só): o tempo real atravessava
       e via o jardim pela parede do estar e o vão escuro pela parede de fora nos fundos — js/bimverso.js */
    this.versoInfo = (typeof window !== 'undefined' && window.__semVerso) ? null : adicionarVersos(THREE, sc, (o) => !(o.userData.espelho || (o.material.userData && (o.material.userData.planar || o.material.userData.id === 'espelho'))), cena.luzes);
    /* A LUZ ASSADA: quem ganha pedaço do atlas e a UV2 (xatlas num worker) — enquanto as texturas chegam e ANTES do 1º
       quadro (o material compila uma vez, já com o atributo uv1) */
    if (this.assada) { this.assada.descartar(); this.assada = null; }
    this.uvInfo = null; this.assadaInfo = null;
    const nomeQ = Object.keys(QUALIDADES).find((k) => QUALIDADES[k] === this.qual) || 'alta';
    if (this.o.luzAssada !== false) this.assada = new LuzAssada(nomeQ);
    const uvP = this.assada ? this.assada.prepararUV(this._cenaSemEntorno() /* [frente F] */).catch((e) => { this.assadaInfo = { erro: 'UV2: ' + String(e && e.message || e) }; try { console.warn('luz assada (UV2):', e); } catch (x) { /* sem console */ } return null; }) : Promise.resolve(null);
    /* luminárias do projeto (as mesmas grandezas do motor: painel em cd/m², spot e pontual em cd) */
    (cena.luzes || []).forEach((l) => {
      let o;
      if (l.tipo === 'painel') {
        o = new THREE.RectAreaLight(corLin(l.cor), l.intensidade, l.circular ? l.largura * 0.886 : l.largura, l.circular ? l.largura * 0.886 : l.profundidade);
        o.position.set(l.posicao[0], l.posicao[1], l.posicao[2]);
        o.rotation.order = 'YXZ'; o.rotation.y = l.rotY || 0; o.rotation.x = l.rotX == null ? -Math.PI / 2 : l.rotX;   /* [frente I] rotX: sanca */
      } else if (l.tipo === 'spot') {
        o = new THREE.SpotLight(corLin(l.cor), l.intensidade, 0, l.angulo / 2 * Math.PI / 180, 0.3, 2);
        o.position.set(l.posicao[0], l.posicao[1], l.posicao[2]);
        const dv = l.dir || [0, -1, 0];   /* [frente I] spot dirigível */
        o.target.position.set(l.posicao[0] + dv[0], l.posicao[1] + dv[1], l.posicao[2] + dv[2]); sc.add(o.target);
      } else {
        o = new THREE.PointLight(corLin(l.cor), l.intensidade, 0, 2);
        o.position.set(l.posicao[0], l.posicao[1] - 0.05, l.posicao[2]);
      }
      o.visible = l.ligada !== false; o.userData.id = l.id; o.userData.base = l.intensidade; o.userData.ligada = o.visible; this.luzes[l.id] = o; sc.add(o);
    });
    this._luzesCena = cena.luzes || [];   /* [frente E] os dados das luminárias vão para a luz assada e as sondas */
    /* [frente I] os COMANDOS (quem acende junto), o brilho das acesas e o clique; a luz deles é assada por comando (bimluzcircuitos.js) */
    this.circuitos = this._luzesCena.length && this.o.circuitos !== false ? new Circuitos(this, cena, { estado: this.o.estadoLuzes }) : null;
    this.definirCeu(cena.sol, cena.ceu);
    this._luzesDoDia();
    await Promise.all(this._pend);
    this.uvInfo = await uvP;
    if (!this.uvInfo && this.assada) { this.assada.descartar(); this.assada = null; }
    this._luzesDoDia();   /* [frente E] sem atlas (a UV2 falhou) as luminárias voltam ao tempo real */
    let falhas = 0;
    sc.traverse((o) => { const m = o.material; if (!m) return; ['map', 'normalMap', 'roughnessMap'].forEach((k) => { if (m[k] && (m[k].userData.erro || !m[k].image)) { if (m[k].userData.erro) falhas++; m[k] = null; m.needsUpdate = true; } }); });
    /* [frente F] o entorno (grama 3D + árvores com vento, js/bimentorno.js): fora da luz assada e das sondas (userData.entorno) */
    await this._entornoMontar(cena);
    this._montarPipeline();
    /* [frente R] */ this.reflexo.preparar(cena);
    this._luzObra();
    if (this.mat2k) this.mat2k.conferir();   /* [frente G] reserva 1K que falhou vira textura neutra */
    /* [frente G] o 1K já está na tela; o 2K chega material a material, sem bloquear (ver bimmat2k.js) */
    if (this.mat2k) this.mat2k.iniciar(cena.grupos, mats).catch((e) => { try { console.warn('materiais 2K:', e); } catch (x) { /* sem console */ } });
    this.info = { triangulos: tri, materiais: mats.length, luzes: (cena.luzes || []).length, espelhos: this.espelhos.length, texturasFalharam: falhas, uv2: this.uvInfo, mat2k: this.mat2k ? this.mat2k.info() : null, entorno: this.entornoInfo || null };
    return this.info;
  }

  /* o sol (lux) e o céu (cd/m²) — trocar a hora só refaz isto, não a cena */
  definirCeu(sol, ceu) {
    const sc = this.scene;
    this._solDados = sol; this._ceuDados = ceu;
    /* [frente R] o MESMO sol de hora em hora (cor, lux e direção novos): um sol novo trazia um mapa de sombra novo e os
       desenhos fora da tela principal (refletor, sonda de reflexo) seguiam lendo o velho, já descartado */
    const solVelho = this.sol && sol && sol.lux > 0 ? this.sol : null;
    if (this.sol && !solVelho) { sc.remove(this.sol); sc.remove(this.sol.target); this.sol.dispose(); this.sol = null; }
    if (sol && sol.lux > 0) {
      const s = this.sol = solVelho || new THREE.DirectionalLight(corLin(sol.cor), sol.lux);
      if (solVelho) { s.color.copy(corLin(sol.cor)); s.intensity = sol.lux; s.shadow.needsUpdate = true; }
      s.userData.base = sol.lux;
      /* 1º palpite do fotômetro (antes da 1ª medida): cena externa ao sol, refletância média de 18 % */
      if (!this._medidas) { this.ev = this.evAlvo = Math.log2(Math.max(1, sol.lux * 1.15 * 0.18 / Math.PI) * 100 / 12.5); }
      /* a sombra enquadra a CASA, não o terreno de 275 m: texel ~10 × menor, desvio de sombra ~10 × menor (a frente A mediu
         ~16 cm de desvio com o terreno na caixa — a luz vazava pela base das paredes) */
      const bx = this.caixaCasa && !this.caixaCasa.isEmpty() ? this.caixaCasa : this.caixa;
      const c = bx && !bx.isEmpty() ? bx.getCenter(new THREE.Vector3()) : new THREE.Vector3();
      const R = bx && !bx.isEmpty() ? bx.getSize(new THREE.Vector3()).length() / 2 + 2 : 30;
      const d = new THREE.Vector3(sol.direcao[0], sol.direcao[1], sol.direcao[2]).normalize();
      s.position.copy(c).addScaledVector(d, R * 2); s.target.position.copy(c);
      s.castShadow = true;
      s.shadow.mapSize.set(this.qual.sombra, this.qual.sombra);
      const cs = s.shadow.camera; cs.left = -R; cs.right = R; cs.top = R; cs.bottom = -R; cs.near = 0.1; cs.far = R * 4; cs.updateProjectionMatrix();
      cs.layers.enable(1);   /* [frente P] a sombra das árvores (camada 1) entra no mapa seja qual for a câmera que dispare a atualização */
      s.shadow.bias = -0.0002; s.shadow.normalBias = 0.02; s.shadow.radius = 3;
      if (!solVelho) { sc.add(s); sc.add(s.target); }
      /* [frente R] SOMBRA ESTÁTICA: a cena não se mexe — o mapa do sol (8192² no Ultra) é desenhado quando o sol muda, não a
         cada quadro; o three r186 o redesenhava também para CADA câmera extra (o refletor do piso, as faces da sonda) */
      s.shadow.autoUpdate = false; s.shadow.needsUpdate = true;
    }
    if (ceu) {
      /* o céu vai à placa em meio-float (filtrável em qualquer WebGPU) */
      /* HORIZONTE: abaixo da linha do horizonte o fundo vira a cor do horizonte (o terreno acaba a ~5 × a casa; o céu de
         baixo, marrom-acinzentado, aparecia como uma faixa) e a neblina usa a mesma cor — a perspectiva aérea */
      const W = ceu.largura, H = ceu.altura, n = W * H * 4, h = new Uint16Array(n), hz = [0, 0, 0], lh = Math.floor(H / 2) + 1;
      for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) hz[c] += ceu.dados[(lh * W + x) * 4 + c] / W;
      this._horizonte = hz;
      /* céu FOTOGRAFADO (js/bimceuhdri.js): a metade de baixo é terreno de verdade (morro, campo) — fica como está */
      const foto = !!ceu.foto;
      for (let i = 0; i < n; i++) { const lin = Math.floor(i / 4 / W), c = i & 3; const v = !foto && lin < lh && c < 3 ? hz[c] * 0.92 : (ceu.dados[i] || 0); h[i] = THREE.DataUtils.toHalfFloat(Math.min(MAX_MEIO, Math.max(0, v))); }
      if (!sc.fog) sc.fog = new THREE.FogExp2(0xffffff, 0.0075);
      const t = new THREE.DataTexture(h, ceu.largura, ceu.altura, THREE.RGBAFormat, THREE.HalfFloatType);
      t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.LinearSRGBColorSpace;
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
      if (this._ceu) this._ceu.dispose();
      sc.environment = t; sc.background = t; this._ceu = t;
    }
    if (this.luzes && Object.keys(this.luzes).length) this._luzesDoDia();
    if (this.pipeline) this._luzObra();   /* hora nova: a luz da obra é refeita (a cena já existe); a anterior é cancelada */
    this.mexeu();
  }

  /* [frente F] O ENTORNO — grama 3D e árvores com vento (js/bimentorno.js, importado só aqui). Entra na cena como um grupo
     de malhas marcadas userData.entorno: a luz assada e as sondas recebem a cena SEM elas (são dinâmicas e leves). */
  _cenaSemEntorno() { const sc = this.scene; return { traverse: (f) => sc.traverse((o) => { if (!(o.userData && (o.userData.entorno || o.userData.verso /* [frente E2] */))) f(o); }) }; }
  async _entornoMontar(cena) {
    this.entornoInfo = null;
    if (this.o.entorno === false) return;
    try {
      const M = await import('./bimentorno.js'), nomeQ = Object.keys(QUALIDADES).find((k) => QUALIDADES[k] === this.qual) || 'alta';
      const e = new M.Entorno({ qualidade: nomeQ, aniso: this.aniso, auto: this.o.entornoAuto });   /* [Cena: objetos] entornoAuto:false = sem o plantio aleatório (a grama fica) */
      this.entornoInfo = await e.montar(cena, { casa: this.caixaCasa, camera: this.camera });
      this.scene.add(e.grupo); this.entorno = e;
      try { e.tingirChao(this.scene, cena); } catch (er) { /* [frente F] sem o tom verde do chão o gramado só fica mais ralo */ }
      e.ligar(this.o.entorno !== false);
    } catch (err) { this.entornoInfo = { erro: String(err && err.message || err) }; try { console.warn('entorno:', err); } catch (x) { /* sem console */ } }
  }
  /* [frente F] ms de PLACA por quadro (consulta de tempo da placa, não depende da CPU): com e sem o entorno; precisa de opcoes.medirGpu */
  async medirGpu(quadros) {
    const r = this.renderer, n = quadros || 30; if (!r || !this.o.medirGpu) return null;
    const ligado = this.entornoLigado(), dorme = (ms) => new Promise((f) => setTimeout(f, ms)), cad = this.reflexo ? this.reflexo.cadencia : true;
    if (this.reflexo) this.reflexo.cadencia = false;   /* [frente P] a câmera parada pularia os refletores: a medida é do quadro CHEIO (a mesma de antes da cadência) */
    this.parar(); await dorme(500);
    const med = async (k) => { const v = []; for (let i = 0; i < k + 4; i++) { this.pipeline.render(); const d = await r.resolveTimestampsAsync('render'); if (i >= 4 && d > 0) v.push(d); } v.sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };   /* mediana: a placa é dividida com o PC todo, a média engolia picos */
    let com = null, sem = null;
    if (this.entorno) { const a1 = (this.entornoLigado(true), await med(n)), b1 = (this.entornoLigado(false), await med(n)), a2 = (this.entornoLigado(true), await med(n)), b2 = (this.entornoLigado(false), await med(n)); com = (a1 + a2) / 2; sem = (b1 + b2) / 2; } else sem = await med(n);   /* A B A B: a deriva da placa cai nos dois lados */
    /* por partes (o orçamento é ≤ 2 ms): só a grama e só as árvores, cada uma contra o "sem" medido acima */
    let partes = null;
    if (this.entorno && sem != null) {
      this.entornoLigado(true); const ms = []; this.entorno.grupo.traverse((o) => { if (o.isMesh && o.userData.entorno) ms.push([o, o.visible]); });
      const so = (f) => ms.forEach(([o, v]) => { o.visible = f(o) && v; });
      so((o) => o.name === 'grama'); const g = await med(n); so((o) => o.name !== 'grama'); const a = await med(n); so(() => true);
      partes = { gramaMs: g != null ? +(g - sem).toFixed(2) : null, arvoresMs: a != null ? +(a - sem).toFixed(2) : null };
    }
    if (this.reflexo) this.reflexo.cadencia = cad;
    this.entornoLigado(ligado); this.rodar();
    return { partes: partes, comMs: com && +com.toFixed(2), semMs: sem && +sem.toFixed(2), entornoMs: com != null && sem != null ? +(com - sem).toFixed(2) : null, quadros: n };
  }
  /* liga/desliga (sem argumento: devolve o estado) */
  entornoLigado(on) {
    if (on === undefined) return !!(this.entorno && this.entorno.ligado);
    if (!this.entorno) return false;
    const r = this.entorno.ligar(on); this.o.entorno = r; this.mexeu(); return r;
  }

  /* A LUZ DA OBRA (js/bimluzobra.js): roda em pedaços; um cálculo novo cancela o anterior */
  async calcularLuz(ch) {
    const tok = this._tokLuz = (this._tokLuz || 0) + 1;
    this.luzInfo = { calculando: true, progresso: 0 };
    try {
      const r = await calcularLuz({ scene: this._cenaSemEntorno() /* [frente F] */, sol: this._solDados, ceu: this._ceuDados, passo: this.qual.luzPasso, raios: this.qual.luzRaios, passadas: 2,
        luzes: this._lumNoAtlas() ? (this.circuitos ? this.circuitos.luzesSondas() : this._luzesAtivas()) : null,   /* [frente E] as sondas levam as luminárias quando o tempo real não as desenha */
        grupos: !!(this.circuitos && this._lumNoAtlas()),   /* [frente I] a direta de cada comando à parte */
        aoProgresso: (f) => { if (tok === this._tokLuz) this.luzInfo.progresso = f; }, cancelado: () => tok !== this._tokLuz || !this.renderer });
      if (!r || tok !== this._tokLuz) return;
      if (this.circuitos && r.grupos) this.circuitos.carregarSondas(r); else this.luz.carregar(r);   /* [frente I] */
      this._luzR = r; this.uGI.value = this.lm.uAtiva.value ? this.ajusteLM.gi : 0.35;
      this.luzInfo = { calculando: false, ms: r.ms, sondas: r.sondas, validas: r.validas, passo: Math.round(r.passo * 100) / 100, raios: r.raios };
      this._guardarLuz(ch, 'sondas', r, r.faces.reduce((s, f) => s + f.byteLength, 0));   /* [frente E3] */
      this.mexeu();
    } catch (e) { this.luzInfo = { calculando: false, erro: String(e && e.message || e) }; try { console.warn('luz da obra:', e); } catch (x) { /* sem console */ } }
  }

  /* A LUZ ASSADA (js/bimluzassada.js): na placa, em faixas, dividindo a placa com o tempo real; a rápida vai à tela em
     segundos e a completa em minutos. Um cálculo novo (hora nova) cancela o anterior; o atlas velho fica até o novo chegar. */
  /* a luz assada (placa) primeiro; as sondas (CPU, ~1 min em 6 workers) começam quando a rápida chega — elas só servem
     às malhas sem atlas, e as duas juntas atrasavam a rápida (20/10/2026) */
  _luzObra() {
    /* [frente E3] antes de calcular, procura a luz já calculada no cache (js/bimluzcache.js): a chave leva a geometria, os materiais,
       o sol/céu, as luminárias, a qualidade e o texto do código do cálculo — qualquer mudança é um cálculo novo */
    const tok = this._tokCache = (this._tokCache || 0) + 1;
    const seguir = (ch) => { if (tok === this._tokCache && this.renderer) this._luzObraPronta(ch, tok); };
    this._chaveLuzCache().then(seguir, () => seguir(null));
  }
  async _luzObraPronta(ch, tokCache) {
    let atHit = null, soHit = null;
    const t0 = performance.now();
    if (ch && this._luzCache) {
      const comAtlas = !!(this.assada && this.uvInfo);
      [atHit, soHit] = await Promise.all([comAtlas ? this._luzCache.ler(ch, 'atlas') : null, this._luzCache.ler(ch, 'sondas')]);
      if (tokCache !== this._tokCache || !this.renderer) return;
      const ms = Math.round(performance.now() - t0);
      if (atHit) this._aplicarAtlasCache(atHit, ms);
      if (soHit) this._aplicarSondasCache(soHit, ms);
    }
    if (!(this.assada && this.uvInfo)) { if (!soHit) this.calcularLuz(ch); return; }
    if (atHit) { if (!soHit) this.calcularLuz(ch); return; }
    let foi = false;
    const p = this.calcularLuzAssada(() => sondas(), ch), tok = this._tokLM;
    const sondas = () => { if (foi || tok !== this._tokLM) return; foi = true; if (!soHit) this.calcularLuz(ch); };
    p.then(sondas, sondas);
  }
  /* a chave do cache desta luz (null = sem cache: opcao luzCache:false, sem IndexedDB ou qualquer falha) */
  async _chaveLuzCache() {
    if (this.o.luzCache === false) return null;
    if (this._luzCache === undefined) { try { this._luzCache = new LUZCACHE.LuzCache(LUZCACHE.armazemIDB()); } catch (e) { this._luzCache = null; } }
    if (!this._luzCache) return null;
    const lista = []; this._cenaSemEntorno().traverse((o) => { if (o.isMesh && o.geometry && o.geometry.getAttribute('position')) lista.push(o); });
    const matSig = new Map(), sigDe = (m) => {
      if (!m) return 'sem-material';
      if (!matSig.has(m)) { const a = albedoDe(m).map((v) => Math.round(v * 1e4)); matSig.set(m, [m.userData && m.userData.id, a.join(','), m.transmission || 0, m.transparent ? 1 : 0, m.metalness || 0].join('|')); }
      return matSig.get(m);
    };
    const R = (a) => (a ? LUZCACHE.resumo(a) : Promise.resolve(''));
    const geo = await Promise.all(lista.map(async (o) => {
      o.updateMatrixWorld(true); const g = o.geometry, mw = o.matrixWorld.elements;
      const [hp, hu, hi] = await Promise.all([R(g.getAttribute('position').array), R(g.getAttribute('uv1') && g.getAttribute('uv1').array), R(g.index && g.index.array)]);
      return [hp, hu, hi, Array.from(mw, (v) => Math.round(v * 1e5)).join(','), sigDe(o.material), o.visible ? 1 : 0, o.userData && o.userData.espelho ? 1 : 0];
    }));
    const nomeQ = Object.keys(QUALIDADES).find((k) => QUALIDADES[k] === this.qual) || 'alta';
    const mod = (n) => new URL(n, import.meta.url).href;
    const codigo = await LUZCACHE.resumoDoCodigo(['./bimluzassada.js', './bimluzobra.js', './bimluzassada-uv.js', './bimluzluminarias.js'].map(mod));
    return LUZCACHE.chaveDe({
      geometria: await LUZCACHE.resumo(JSON.stringify(geo)), sol: LUZCACHE.chaveSol(this._solDados), ceu: LUZCACHE.chaveCeu(this._ceuDados),
      luzes: this._lumNoAtlas() ? JSON.stringify(this._luzesAtivas()) : 'tempo-real', atlas: this.uvInfo ? [this.uvInfo.largura, this.uvInfo.altura, this.uvInfo.texel].join('x') : 'sem-atlas',
      qualidade: [nomeQ, this.qual.luzPasso, this.qual.luzRaios].join('|'), codigo: codigo, three: THREE.REVISION
    });
  }
  _aplicarSondasCache(r, ms) {
    this._tokLuz = (this._tokLuz || 0) + 1;   /* um cálculo em andamento fica cancelado */
    this.luz.carregar(r); this._luzR = r; this.uGI.value = this.lm.uAtiva.value ? this.ajusteLM.gi : 0.35;
    this.luzInfo = { calculando: false, ms: ms, sondas: r.sondas, validas: r.validas, passo: Math.round(r.passo * 100) / 100, raios: r.raios, doCache: true, msCalculo: r.ms };
    this.mexeu();
  }
  _aplicarAtlasCache(at, ms) {
    this._tokLM = (this._tokLM || 0) + 1;   /* um cálculo em andamento (hora anterior) fica cancelado */
    this.lm.carregar(at); this._ajustarLM();
    this.assadaInfo = { calculando: false, pronta: true, progresso: 1, fase: 'completa', doCache: true, ms: ms, atlas: at.largura + '×' + at.altura, uv: this.uvInfo };
    this.mexeu();
  }
  /* grava no cache sem travar o quadro (a serialização de dezenas de MB vai para depois do quadro) */
  _guardarLuz(ch, tipo, valor, bytes) {
    if (!ch || !this._luzCache) return;
    setTimeout(() => { this._luzCache.gravar(ch, tipo, valor, bytes).then((r) => { this.cacheInfo = Object.assign(this.cacheInfo || {}, { ['gravou_' + tipo]: r }); }); }, 50);
  }
  async calcularLuzAssada(aposRapida, ch) {
    if (!this.assada || !this.uvInfo) return;
    const tok = this._tokLM = (this._tokLM || 0) + 1, t0 = performance.now(); this._atlasCompleto = null;
    this.assadaInfo = { calculando: true, progresso: 0, fase: 'rapida', uv: this.uvInfo };
    try {
      const info = await this.assada.calcular({
        sol: this._solDados, ceu: this._ceuDados, luzes: this.circuitos ? [] : this._luzesAtivas(),   /* [frente E] luminárias no atlas; [frente I] com comandos, à parte */
        passadas: this.circuitos && this.circuitos.noite() ? this.assada.esq.passadas.slice(0, this.assada.esq.passadas.findIndex((q) => q[1] === 'rapida') + 1) : undefined,   /* [frente I] à noite o céu só na rápida */
        cancelado: () => tok !== this._tokLM || !this.renderer,
        /* ms de placa por quadro: a rápida corre (uns segundos de quadro mais lento); a completa divide — pouco andando,
           muito com a câmera parada (aí o tempo real também cede quadros, ver rodar) */
        ritmoMs: (fase) => (fase === 'rapida' ? 24 : (this.parado() > 1500 ? 16 : 6)),
        aoProgresso: (f, fase) => { if (tok === this._tokLM && this.assadaInfo) { this.assadaInfo.progresso = f; this.assadaInfo.fase = fase; } },
        aoResultado: (at, fase) => {
          if (tok !== this._tokLM || !this.renderer) return;
          this.lm.carregar(at); this._ajustarLM();
          if (fase === 'completa') this._atlasCompleto = at;   /* [frente E3] */
          if (fase === 'rapida' && aposRapida) { try { aposRapida(); } catch (x) { /* as sondas não derrubam o atlas */ } }
          if (this.assadaInfo) { this.assadaInfo['ms_' + fase] = Math.round(performance.now() - t0); this.assadaInfo.atlas = at.largura + '×' + at.altura; }
        }
      });
      if (!info || tok !== this._tokLM) return;
      this.assadaInfo = Object.assign({}, this.assadaInfo, info, { calculando: false, pronta: true, progresso: 1, ms: Math.round(performance.now() - t0) });
      if (this._atlasCompleto) { const ac = this._atlasCompleto; this._atlasCompleto = null; this._guardarLuz(ch, 'atlas', { dados: ac.dados, largura: ac.largura, altura: ac.altura, texel: ac.texel }, ac.dados.byteLength); }   /* [frente E3] */
      /* [frente I] depois do sol e do céu, a luz de cada comando (os já assados ficam: não dependem da hora) */
      if (this.circuitos) await this.circuitos.assar(() => tok !== this._tokLM || !this.renderer);
    } catch (e) {
      if (tok === this._tokLM) this.assadaInfo = { calculando: false, erro: String(e && e.message || e), uv: this.uvInfo };
      try { console.warn('luz assada:', e); } catch (x) { /* sem console */ }
      /* [frente E] sem atlas as luminárias voltam ao tempo real (e as sondas são refeitas sem elas) */
      if (tok === this._tokLM && this.renderer) { this._luzesDoDia(); this.calcularLuz(); }
    }
  }
  /* [frente E] as luminárias vão no atlas (e nas sondas) enquanto houver luz assada sem erro */
  _lumNoAtlas() { return !!(this.assada && !(this.assadaInfo && this.assadaInfo.erro)); }
  _luzesAtivas() { return (this._luzesCena || []).map((l) => { const o = this.luzes[l.id]; return Object.assign({}, l, { ligada: o ? !!o.userData.ligada : l.ligada !== false }); }); }
  _ajustarLM() {
    const on = !!this.lm.uAtiva.value;
    if (this.gi) this.gi.aoIntensity.value = on ? this.ajusteLM.ao : 1;
    this.uGI.value = on ? this.ajusteLM.gi : (this._luzR ? 0.35 : 1);
  }
  /* liga/desliga o atlas (comparação com as sondas; o atlas fica na memória) */
  luzAssadaLigada(on) { if (this.lm.tex === this.lm._vazia) return false; this.lm.uAtiva.value = on ? 1 : 0; this._ajustarLM(); this.mexeu(); return !!on; }

  /* --------------------------------------------------------- o pipeline de imagem */
  _montarPipeline() {
    if (this.pipeline) { try { this.pipeline.dispose(); } catch (e) { /* já descartado */ } }
    const r = this.renderer, q = this.qual;
    const pl = this.pipeline = new THREE.RenderPipeline(r);
    const cena = this.passo = pass(this.scene, this.camera);
    /* ⚠ QUATRO alvos, 24 bytes por pixel: o WebGPU garante só 32 (maxColorAttachmentBytesPerSample). Com um 5º alvo
       (metal/rugosidade à parte) davam 40 e a placa RECUSAVA todo material — a tela saía preta (medido em 20/10/2026).
       A rugosidade vai no alfa da cor difusa e o metal no alfa da normal (os dois alfas estavam livres). */
    cena.setMRT(mrt({ output, diffuseColor: vec4(diffuseColor.rgb, roughness), normal: vec4(packNormalToRGB(normalView), metalness), velocity }));
    const cor = cena.getTextureNode('output'), dif = cena.getTextureNode('diffuseColor'), prof = cena.getTextureNode('depth');
    const nor = cena.getTextureNode('normal'), vel = cena.getTextureNode('velocity');
    cena.getTexture('diffuseColor').type = THREE.UnsignedByteType;
    cena.getTexture('normal').type = THREE.UnsignedByteType;
    const normal = sample((uv) => unpackRGBToNormal(nor.sample(uv).rgb));
    /* luz rebatida + oclusão nos cantos (escala de casa: raio em metros) */
    const gi = this.gi = ssgi(cor, prof, normal, this.camera);
    gi.sliceCount.value = q.giFatias; gi.stepCount.value = q.giPassos; gi.radius.value = 4; gi.thickness.value = 0.5;
    /* com a luz da obra pronta o rebote já está nas sondas: a luz de tela entra só como detalhe (uGI 0,35), a oclusão de canto fica inteira */
    let comp = vec4(add(cor.rgb.mul(gi.getAONode()), dif.rgb.mul(gi.getGINode().rgb).mul(this.uGI)), cor.a);
    if (q.ssr) {
      const rf = this.ssr = ssr(cor, prof, normal, { metalnessNode: nor.a, roughnessNode: dif.a, reflectNonMetals: true, camera: this.camera });
      rf.maxDistance.value = 12; rf.thickness.value = 0.08; rf.quality.value = 0.6;
      comp = vec4(comp.rgb.add(rf.rgb.mul(0.85)), comp.a);
    }
    comp = this.efeitos.compor(comp, cor, prof);   /* [Cena: efeitos] raios de sol (sem o nó no grafo enquanto desligado) */
    const suave = traa(comp, prof, vel, this.camera);
    /* exposição (a da câmera física) e balanço de branco ANTES do bloom: o limiar de brilho fica em "branco da foto" */
    const exp = this.uWB.mul(this.efeitos.posTraa(suave.rgb).mul(this.uExpo));   /* [Cena: efeitos] os fogos (2ª cena) entram depois do TRAA */
    const bl = this.bloom = bloom(vec4(exp, 1), 0.12, 0.35, 1.0);
    this._nos = { exp, bl, comp, cor };
    pl.outputNode = vec4(max(exp.add(bl.rgb), vec3(0)), float(1));
    pl.needsUpdate = true;
    if (this.lm && this.lm.uAtiva.value) this._ajustarLM();
  }

  definirBalanco(wb) { if (wb && wb.length === 9) this.uWB.value.set(wb[0], wb[1], wb[2], wb[3], wb[4], wb[5], wb[6], wb[7], wb[8]); }
  definirTom(tom) { this.renderer.toneMapping = TOM[tom] || THREE.AgXToneMapping; this.o.tom = tom; this._montarPipeline(); }
  definirComp(c) { this.comp = +c || 0; this.mexeu(); }
  luzesLigadas(mapa) {
    /* [frente I] com comandos a luz é por comando: a luminária liga/desliga o comando dela (instantâneo, sem refazer a luz) */
    if (this.circuitos) { Object.keys(mapa || {}).forEach((id) => { const i = this.circuitos.deLuz[id]; if (i != null) this.circuitos.comandos[i].ligado = !!mapa[id]; }); this.circuitos._aplicar(); return; }
    Object.keys(mapa || {}).forEach((id) => { if (this.luzes[id]) this.luzes[id].userData.ligada = !!mapa[id]; }); this._luzesDoDia();
    if (this._lumNoAtlas() && this.pipeline) this._luzObra();   /* [frente E] a luz das luminárias está no atlas: refaz */
    this.mexeu();
  }

  /* LUMINÁRIAS NO TEMPO REAL: cada luz ligada entra no shader de TODO material. No quiosque de ensaio (38 luminárias) o
     processo de GPU do Chrome ficou minutos a 100 % compilando (o compilador do Direct3D é lento com shader grande) e o
     tempo real andava a 2 qps — com a placa a 2 % (20/10/2026). De DIA (sol > 2 mil lux) a luz delas some ao lado do sol
     e elas saem do tempo real; de NOITE ficam as 12 de maior fluxo. A foto física (path tracer) usa todas sempre.
     Próximo passo: a luz das luminárias entra no mapa de luz assada (custo zero andando). */
  _luzesDoDia() {
    const ls = Object.values(this.luzes), dia = !!(this.sol && this.sol.userData.base > 2000), TETO = 12;
    const ligadas = ls.filter((l) => l.userData.ligada).sort((a, b) => b.userData.base - a.userData.base);
    /* [frente E] com a luz assada as luminárias (direta + rebote, com sombra) vêm do atlas: NENHUMA no shader, de dia ou de noite */
    const noAtlas = this._lumNoAtlas();
    /* [Cena: objetos] a luz de um OBJETO da cena (userData.cena) nunca está no atlas: fica no tempo real, de dia e de noite, dentro do teto */
    const daCena = ligadas.filter((l) => l.userData.cena).slice(0, TETO);
    const vis = new Set(dia || noAtlas ? daCena : ligadas.slice(0, TETO));
    let mudou = false;
    ls.forEach((l) => { const v = vis.has(l); if (l.visible !== v) { l.visible = v; mudou = true; } });
    this.luzesTempoReal = { total: ls.length, ligadas: ligadas.length, noTempoReal: vis.size, dia, noAtlas };
    return mudou;
  }

  /* a câmera (formato do BimRender: pos, quat, fov, alvo) */
  definirCamera(c) {
    this.camera.fov = c.fov || 50; this.camera.near = Math.max(0.05, Math.min(0.2, c.near || 0.1)); this.camera.far = Math.max(500, c.far || 2000);
    this.camera.updateProjectionMatrix();
    const pos = new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]);
    let alvo;
    if (c.alvo) alvo = new THREE.Vector3(c.alvo[0], c.alvo[1], c.alvo[2]);
    else { const q = new THREE.Quaternion(c.quat[0], c.quat[1], c.quat[2], c.quat[3]); alvo = pos.clone().add(new THREE.Vector3(0, 0, -10).applyQuaternion(q)); }
    this.nav.olhar(pos, alvo);
    this.mexeu();
  }
  cameraAtual() {
    const c = this.camera;
    return { tipo: 'perspectiva', fov: c.fov, near: c.near, far: c.far, pos: c.position.toArray(), quat: c.quaternion.toArray(), alvo: this.nav.alvo.toArray() };
  }
  modo(m) { this.nav.modo = m === 'caminhar' ? 'caminhar' : 'orbita'; if (m === 'caminhar') { this.nav.vel = 1.4; } return this.nav.modo; }

  mexeu() { this._ultimoMov = performance.now(); if (this.aoMexer) this.aoMexer(); }
  parado() { return performance.now() - this._ultimoMov; }

  /* --------------------------------------------------------- o fotômetro (média logarítmica, ISO 2720 K = 12,5) */
  async _medir() {
    if (this._medindo || !this.passo) return;
    const rt = this.passo.renderTarget; if (!rt || !rt.width) return;
    this._medindo = true;
    /* a pré-exposição do quadro QUE ESTÁ no alvo (o último desenhado), não a de agora: luminância real = medida / k.
       ⚠ Com a foto física por cima o tempo real não desenha; dividir pela exposição corrente realimentava o fotômetro
       e o EV disparava (17,9 numa fachada de EV 15) — a foto seguinte saía branca ou preta (20/10/2026). */
    const k = this._kDesenhado || this.k;
    try {
      const w = rt.width, h = rt.height, x0 = Math.floor(w * 0.1), y0 = Math.floor(h * 0.1), lw = Math.floor(w * 0.8), lh = Math.floor(h * 0.8);
      const px = await this.renderer.readRenderTargetPixelsAsync(rt, x0, y0, lw, lh, 0);
      const meio = px instanceof Uint16Array, f = meio ? THREE.DataUtils.fromHalfFloat : (v) => v;
      let s = 0, n = 0, nulos = 0; const passo = Math.max(1, Math.floor(px.length / 4 / 20000)) * 4;
      for (let i = 0; i < px.length; i += passo) {
        const L = (0.2126 * f(px[i]) + 0.7152 * f(px[i + 1]) + 0.0722 * f(px[i + 2])) / k;
        if (!(L >= 0) || !isFinite(L)) { nulos++; continue; }
        s += Math.log(1e-4 + L); n++;
      }
      this._ultMedida = { amostras: n, invalidos: nulos, Lmedia: n ? Math.exp(s / n) : null, tipo: px && px.constructor && px.constructor.name };
      /* imagem toda preta (L ~ 0) não é medida: é a cena ainda vazia — não leva o EV ao chão */
      if (n && Math.exp(s / n) > 1e-3) { this.evAlvo = Math.log2(Math.exp(s / n) * 100 / 12.5); this._medidas = (this._medidas || 0) + 1; this._tMedida = performance.now(); }
      /* [frente I] À NOITE o olho não abre além da foto noturna de prédio iluminado (EV ~2–3 na tabela de exposição usual): sem esse
         piso a fachada à noite media 0,005 cd/m², ia a EV −4,6 e a luz das janelas virava um clarão branco (21/10/2026) */
      if (!(this._solDados && this._solDados.lux > 0)) this.evAlvo = Math.max(this.evAlvo, EV_NOITE_MIN);
    } catch (e) { this._ultMedida = { erro: String(e && e.message || e) }; }
    this._medindo = false;
  }
  evEfetivo() { return this.ev - this.comp; }
  /* a RADIÂNCIA (cd/m², linear) em pontos da tela (fx, fy ∈ 0..1 a partir do canto de cima) lida da passada da cena — antes
     da luz de tela (SSGI/AO), do reflexo de tela, da curva de tom: a régua que compara a ILUMINAÇÃO com a foto física
     (BimRender/motor.radiancia), sem o pós-processo no meio */
  async radiancias(pontos, raio) {
    const rt = this.passo && this.passo.renderTarget; if (!rt || !rt.width) return null;
    const k = this._kDesenhado || this.k || 1, rr = Math.max(0, raio | 0), lado = 2 * rr + 1, W = rt.width, H = rt.height, out = [];
    for (const [fx, fy] of pontos) {
      const x0 = Math.max(0, Math.min(W - lado, Math.round(fx * (W - 1)) - rr)), y0 = Math.max(0, Math.min(H - lado, Math.round(fy * (H - 1)) - rr));
      const px = await this.renderer.readRenderTargetPixelsAsync(rt, x0, y0, lado, lado, 0);
      /* ⚠ o WebGPU devolve cada LINHA alinhada a 256 bytes: numa janela 9 × 9 em meio-float só 9 de 32 texels por linha
         são pixels — a 1ª versão fazia a média com o enchimento e a radiância saía ×0,3 (20/10/2026) */
      const f = px instanceof Uint16Array ? THREE.DataUtils.fromHalfFloat : (v) => v, o = [0, 0, 0];
      const passo = Math.ceil(lado * 4 * px.BYTES_PER_ELEMENT / 256) * 256 / px.BYTES_PER_ELEMENT;
      for (let j = 0; j < lado; j++) for (let i = 0; i < lado; i++) { const q = j * passo + i * 4; o[0] += f(px[q]); o[1] += f(px[q + 1]); o[2] += f(px[q + 2]); }
      out.push(o.map((v) => Math.round(v / (lado * lado) / k * 100) / 100));
    }
    return out;
  }
  /* o olho já adaptou à vista ATUAL? (uma medida depois do último movimento e o EV no alvo) — a foto física só começa assim */
  olhoAssentado() { return !this.evAuto || ((this._tMedida || 0) > this._ultimoMov + 50 && Math.abs(this.ev - this.evAlvo) < 0.1); }

  /* PRÉ-EXPOSIÇÃO (a técnica do Frostbite e do Unreal): a exposição da câmera entra NAS LUZES, não na imagem.
     ⚠ Sem isso a imagem sai PRETA: o sol a ~100 mil lux passa do teto do meio-float da placa (65 504) nos
     brilhos, vira infinito, e o bloom/TRAA espalham o NaN pela tela (medido em 20/10/2026 na Casa 487).
     Com k = exposição, a cena já chega à placa perto de 1,0 — a mesma conta física, só que pré-multiplicada. */
  _preExpor(e) {
    const k = this.k = e;
    if (this.sol) this.sol.intensity = this.sol.userData.base * k;
    for (const id in this.luzes) { const l = this.luzes[id]; l.intensity = l.userData.base * k; }
    this.scene.environmentIntensity = k; this.scene.backgroundIntensity = k;
    if (this.scene.fog && this._horizonte) { const z = this._horizonte; this.scene.fog.color.setRGB(z[0] * k, z[1] * k, z[2] * k, THREE.LinearSRGBColorSpace); }
    this.luz.uK.value = k;
    this.uExpo.value = e / k;
  }

  /* --------------------------------------------------------- o laço */
  rodar() {
    let t0 = performance.now();
    const quadro = async () => {
      if (!this.renderer || !this.canvas.isConnected) { this.parar(); return; }
      const t = performance.now(), dt = Math.min(0.1, (t - t0) / 1000); t0 = t;
      if (this.nav.passo(dt)) this.mexeu();
      /* olho adaptando (~0,7 s), o fotômetro a cada 20 quadros */
      /* com a foto física por cima, o tempo real descansa (a placa vai toda para ela) e o olho NÃO adapta (não há quadro novo para medir) */
      const descansa = !!(this.refino && this.refino.visivel && this.refino.convergindo);
      if (this.evAuto && !descansa) { this.ev += (this.evAlvo - this.ev) * Math.min(1, dt * 1.6); if (this._quadros % 20 === 0) this._medir(); }
      this._preExpor(1 / (1.2 * Math.pow(2, this.evEfetivo())));
      this.efeitos.quadro(dt);   /* [Cena: efeitos] ANTES do entorno: o vento do quadro já vale */
      if (this.entorno) this.entorno.atualizar(dt, this.camera);   /* [frente F] vento e a grade de grama seguem a câmera */
      /* câmera parada com a luz assada calculando: o tempo real desenha 1 quadro em 3 (a imagem não muda; a placa vai
         para o cálculo). ⚠ medido 20/10/2026: com o tempo real em Ultra a 60 qps o cálculo recebia ~15 % da placa */
      const cede = !!(this.assadaInfo && this.assadaInfo.calculando) && this.parado() > 1500 && (this._quadros % 3) !== 0;
      if (!descansa && !cede) { this.pipeline.render(); this._kDesenhado = this.k; /* [frente R] */ this.reflexo.quadro(); }
      this._quadros++;
      this._qT.push(t); while (this._qT.length && t - this._qT[0] > 1000) this._qT.shift();
      this.estado.qps = this._qT.length;
      if (this.aoQuadro) { try { this.aoQuadro(this); } catch (e) { /* a tela não derruba o laço */ } }
    };
    this.renderer.setAnimationLoop(quadro);
  }
  parar() { try { if (this.renderer) this.renderer.setAnimationLoop(null); } catch (e) { /* já parado */ } }

  imagem(tipo) { return this.canvas.toDataURL(tipo || 'image/png'); }

  /* DIAGNÓSTICO: de uma sonda (x, y, z do motor), em que os raios batem — material, frente/verso, distância */
  diagSonda(x, y, z, nRaios) {
    const N = nRaios || 64, rc = new THREE.Raycaster(), lados = [];
    this.scene.traverse((o) => { if (o.isMesh && o.material) { lados.push([o.material, o.material.side]); o.material.side = THREE.DoubleSide; } });
    const g = Math.PI * (3 - Math.sqrt(5)), cont = {};
    try {
      for (let i = 0; i < N; i++) {
        const yy = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - yy * yy), d = new THREE.Vector3(Math.cos(g * i) * r, yy, Math.sin(g * i) * r);
        rc.set(new THREE.Vector3(x, y, z), d); rc.far = 200;
        const h = rc.intersectObjects(this.scene.children, true).filter((q) => q.object.isMesh && q.face)[0];
        const k = !h ? 'céu' : (h.object.material.userData.id || '?') + (h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(d) > 0 ? ' VERSO' : '') + (h.distance < 0.5 ? ' (<0,5 m)' : '');
        cont[k] = (cont[k] || 0) + 1;
      }
    } finally { lados.forEach(([m, s]) => { m.side = s; }); }
    return cont;
  }

  /* DIAGNÓSTICO da luz da obra: o que está sob um ponto da tela (fx, fy ∈ 0..1) e as 8 sondas que a consulta usa */
  diagnosticar(fx, fy) {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(fx * 2 - 1, 1 - fy * 2), this.camera);
    const hs = rc.intersectObjects(this.scene.children, true).filter((h) => h.object.isMesh && h.face);
    if (!hs.length) return null;
    const h = hs[0], n = h.face.normal.clone().transformDirection(h.object.matrixWorld), S = h.point, r = this._luzR;
    if (n.dot(rc.ray.direction) > 0) n.negate();
    const o = { ponto: S.toArray().map((v) => +v.toFixed(3)), normal: n.toArray().map((v) => +v.toFixed(3)), material: h.object.material && h.object.material.userData.id, frente: h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(rc.ray.direction) < 0, cantos: [] };
    if (!r) return o;
    const P = r.passo, org = r.origem, [nx, ny] = r.n, Q = S.clone().addScaledVector(n, P * 0.5);
    const f = [(Q.x - org[0]) / P, (Q.y - org[1]) / P, (Q.z - org[2]) / P], i0 = f.map((v, k) => Math.max(0, Math.min(r.n[k] - 2, Math.floor(v))));
    for (let c = 0; c < 8; c++) {
      const d = [c & 1, (c >> 1) & 1, (c >> 2) & 1], ix = i0[0] + d[0], iy = i0[1] + d[1], iz = i0[2] + d[2], k = ix + nx * (iy + ny * iz);
      const pp = new THREE.Vector3(org[0] + ix * P, org[1] + iy * P, org[2] + iz * P), v = pp.clone().sub(S).normalize();
      const fx_ = n.x >= 0 ? 0 : 1, fy_ = n.y >= 0 ? 2 : 3, fz_ = n.z >= 0 ? 4 : 5;
      const E = [0, 1, 2].map((ch) => Math.round(n.x * n.x * r.faces[fx_][k * 4 + ch] + n.y * n.y * r.faces[fy_][k * 4 + ch] + n.z * n.z * r.faces[fz_][k * 4 + ch]));
      o.cantos.push({ sonda: pp.toArray().map((x) => +x.toFixed(2)), alfa: +r.faces[0][k * 4 + 3].toFixed(2), lado: +v.dot(n).toFixed(2), E });
    }
    return o;
  }

  limparCena() {
    const sc = this.scene;
    if (this.entorno) { try { this.entorno.descartar(); } catch (e) { /* já descartado */ } this.entorno = null; }   /* [frente F] */
    if (this.circuitos) { this.circuitos.descartar(); this.circuitos = null; }   /* [frente I] */
    if (this.efeitos) this.efeitos.limpar();   /* [Cena: efeitos] */
    if (this.objetos) this.objetos.aoLimpar();   /* [Cena: objetos] */
    sc.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.espelhos.forEach((e) => { try { e.refl.dispose(); } catch (x) { /* sem dispose nesta versão */ } });
    /* [frente R] */ if (this.reflexo) this.reflexo.limpar();
    sc.clear(); this.luzes = {}; this.sol = null; this.espelhos = [];
    this.texturas.forEach((t) => t.dispose()); this.texturas = []; this._cacheTex = {};
    if (this.mat2k) this.mat2k.descartar();   /* [frente G] devolve as texturas 2K à placa */
    if (this._ceu) { this._ceu.dispose(); this._ceu = null; }
    sc.environment = null; sc.background = null;
  }
  descartar() {
    this.parar();
    if (this._ro) this._ro.disconnect();
    if (this.nav) this.nav.descartar();
    this._tokLuz = (this._tokLuz || 0) + 1;
    this._tokLM = (this._tokLM || 0) + 1;
    if (this.assada) { try { this.assada.descartar(); } catch (e) { /* já descartado */ } this.assada = null; }
    this.limparCena();
    this.luz.descartar();
    this.lm.descartar();
    this.circ.descartar();   /* [frente I] */
    if (this.objetos) { this.objetos.descartar(); this.objetos = null; }   /* [Cena: objetos] */
    if (this.efeitos) { this.efeitos.descartar(); this.efeitos = null; }   /* [Cena: efeitos] */
    /* [frente R] */ if (this.reflexo) this.reflexo.descartar();
    try { if (this.pipeline) this.pipeline.dispose(); } catch (e) { /* já descartado */ }
    try { this.renderer.dispose(); } catch (e) { /* já descartado */ }
    this.renderer = null;
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}

/* o aparelho roda? (WebGPU com adaptador de verdade) */
export async function suportado() {
  try {
    if (!navigator.gpu) return { ok: false, motivo: 'Este navegador não tem WebGPU (use o Chrome ou o Edge atualizados).' };
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!a) return { ok: false, motivo: 'A placa de vídeo não liberou o WebGPU para o navegador.' };
    const i = a.info || {};
    return { ok: true, placa: [i.vendor, i.architecture, i.description].filter(Boolean).join(' '), fallback: !!a.isFallbackAdapter };
  } catch (e) { return { ok: false, motivo: String(e && e.message || e) }; }
}
export const REVISAO_THREE = THREE.REVISION;

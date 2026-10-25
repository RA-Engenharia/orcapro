/* =====================================================================
 * bimreflexo.js — REFLEXOS do render ao vivo (frente R, 20/10/2026)
 * Importado pelo js/bimrendervivo.js (ganchos marcados "[frente R]").
 *
 * O que faltava: o reflexo de tela (SSR) só reflete o que está NA TELA e,
 * no modo espelho do three, pesa pelo METAL (piso e vidro, metal 0, não
 * recebiam nada); o resto vinha do CÉU atenuado pela visibilidade de céu
 * das sondas — dentro de casa o piso e o vidro refletiam quase nada.
 *
 * 1. SONDA DE REFLEXO POR CÔMODO (a técnica do Enscape/Unreal sem RTX):
 *    o BIM sabe os cômodos (contorno, base e topo; IfcSpace no IFC; sem
 *    nada, a caixa da obra). Uma captura cúbica no centro de cada cômodo
 *    (1,5 m do piso) vira um ladrilho octaédrico pré-filtrado por
 *    rugosidade (GGX, 6 níveis) num ATLAS único; o material acha o cômodo
 *    do ponto por uma GRADE 3D (0,2 m) e lê a sonda dele com a direção
 *    CORRIGIDA pela caixa do cômodo (box projection): o reflexo no piso
 *    fica no lugar certo da parede/janela, e não "colado" no infinito.
 *    Fora de qualquer cômodo, segue o céu. Refeita só quando a luz muda
 *    (hora, céu, luz assada, sondas de luz, luminárias), uma sonda por
 *    quadro — a imagem nunca engasga.
 * 2. PISO BRILHANTE GRANDE: o(s) maior(es) plano(s) de piso com verniz
 *    (porcelanato, mármore, granito, concreto polido, cerâmica esmaltada,
 *    madeira envernizada) ganha(m) o reflexo PLANAR exato (o mesmo
 *    ReflectorNode do espelho) no lugar do reflexo da camada de verniz,
 *    desfocado pela rugosidade dela (mip do reflexo).
 *
 * A GEOMETRIA PURA (grade, octaédrico, caixa, GGX, planos) está no
 * js/bimreflexo-salas.js, testada em node (tools/test-bimreflexo.js).
 * ===================================================================== */
import * as CORE from '../bim/vendor/jsm/pathtracer/three/three.core.js';
import * as GPU from '../bim/vendor/jsm/pathtracer/three/three.webgpu.js';
import {
  uniform, uniformArray, texture, texture3D, cubeTexture, reflector, vec2, vec3, vec4, float, int, select, abs, max, min, clamp, floor,
  normalize, dot, cross, mix, smoothstep, step, screenCoordinate, Loop, Fn, positionWorld, normalWorld, normalView, clearcoatNormalView,
  roughness, clearcoatRoughness, positionViewDirection, cameraWorldMatrix, pow4
} from '../bim/vendor/jsm/pathtracer/three/three.tsl.js';
import { salasDe, amostrasGGX, planosDoPiso } from './bimreflexo-salas.js';

const THREE = Object.assign({}, CORE, GPU);
const NIVEIS = 6;                         /* rugosidade 0; 0,2; 0,4; 0,6; 0,8; 1 */
const EV_CAPTURA = 9;                     /* a sonda é gravada nesta exposição (meio-float folgado de 0,05 a 4·10⁷ cd/m²) */
const K_CAPTURA = 1 / (1.2 * Math.pow(2, EV_CAPTURA));
const MAX_SALAS = 64;
/* por qualidade: ladrilho (px), face do cubo (px), amostras GGX, planos de piso com reflexo exato e a escala dele */
const POR_QUALIDADE = {
  leve:  { T: 64,  S: 64,  K: 24, planos: 0, escPlanar: 0.5 },
  alta:  { T: 128, S: 128, K: 48, planos: 1, escPlanar: 0.5 },
  ultra: { T: 128, S: 128, K: 64, planos: 2, escPlanar: 0.5 }
};

/* mapa octaédrico na placa (o par CPU está em bimreflexo-salas.js; os dois são testados um contra o outro pela foto) */
function octaCodT(d) {
  const s = abs(d.x).add(abs(d.y)).add(abs(d.z)), px = d.x.div(s), pz = d.z.div(s);
  const sx = select(px.greaterThanEqual(0), float(1), float(-1)), sz = select(pz.greaterThanEqual(0), float(1), float(-1));
  const qx = select(d.y.lessThan(0), float(1).sub(abs(pz)).mul(sx), px), qz = select(d.y.lessThan(0), float(1).sub(abs(px)).mul(sz), pz);
  return vec2(qx, qz).mul(0.5).add(0.5);
}
function octaDecT(o) {
  const p = o.mul(2).sub(1), y = float(1).sub(abs(p.x)).sub(abs(p.y)), t = max(y.negate(), 0);
  const x = p.x.add(select(p.x.greaterThanEqual(0), t.negate(), t)), z = p.y.add(select(p.y.greaterThanEqual(0), t.negate(), t));
  return normalize(vec3(x, y, z));
}
/* o vetor refletido do three (EnvironmentNode): espelhado, puxado para a normal com a rugosidade⁴, no MUNDO */
function refletido(rug, nView) {
  return pow4(rug).mix(positionViewDirection.negate().reflect(nView), nView).normalize().transformDirection(cameraWorldMatrix);
}

export class ReflexoObra {
  constructor(vivo, nomeQualidade, desligado) {
    this.vivo = vivo; this.desligado = !!desligado;   /* desligado: nenhum recurso nem shader (a medida do "antes") */
    const q = this.q = POR_QUALIDADE[nomeQualidade] || POR_QUALIDADE.alta;
    this.T = q.T; this.S = q.S; this.K = q.K;
    this.salas = []; this.grade = null; this._pisos = []; this.planos = []; this._ocultar = [];
    this._refletores = []; this.cadencia = !(vivo.o && vivo.o.cadenciaRefletor === false);   /* [frente P] */
    this._fila = []; this._sig = ''; this._tMudou = 0; this._ms = [];
    this.info = { salas: 0, planos: [], capturas: 0, pronta: false };
    /* nós da placa — texturas de reserva até a 1ª captura (trocar a textura é só .value: nada recompila) */
    const atl = this._atlasVazio = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType); atl.needsUpdate = true;
    const gv = this._gradeVazia = new THREE.Data3DTexture(new Uint8Array(1), 1, 1, 1); gv.format = THREE.RedFormat; gv.type = THREE.UnsignedByteType; gv.minFilter = gv.magFilter = THREE.NearestFilter; gv.unpackAlignment = 1; gv.needsUpdate = true;
    this.atlasNo = texture(atl, vec2(0));
    this.gradeNo = texture3D(gv, vec3(0));
    this.uAtiva = uniform(0); this.uCaptura = uniform(0); this.uEsc = uniform(1); this.uPlanar = uniform(1);
    this.uGOrig = uniform(new THREE.Vector3()); this.uGTam = uniform(new THREE.Vector3(1, 1, 1)); this.uAltura = uniform(1);
    this.uCx = uniformArray(Array.from({ length: MAX_SALAS * 3 }, () => new THREE.Vector4()), 'vec4');
  }

  /* ------------------------------------------------ o material (gancho no AmbienteComLuzObra do motor) */
  /* o cômodo do ponto, a caixa e o peso (0 fora de cômodo, na face virada para fora e durante a própria captura) */
  _prep(oc) {
    if (this._p) return this._p;
    const P = positionWorld, N = normalWorld;
    const g = this.gradeNo.sample(P.sub(this.uGOrig).div(this.uGTam)).level(0).r;
    const idf = floor(g.mul(255).add(0.5)).sub(1).toVar('rfIdx');
    const i = int(max(idf, 0)).toVar('rfI');
    const mn = this.uCx.element(i.mul(3)).xyz.toVar('rfMin'), mx = this.uCx.element(i.mul(3).add(1)).xyz.toVar('rfMax'), cw = this.uCx.element(i.mul(3).add(2)).toVar('rfC');
    /* a face tem de olhar para DENTRO do cômodo: a face de fora do vidro e da parede externa segue o céu */
    const frente = smoothstep(-0.2, 0.05, dot(N, normalize(cw.xyz.sub(P))));
    /* sonda "reserva" (a caixa da obra inteira, IFC sem IfcSpace): só onde o céu quase não chega */
    const reserva = mix(float(1), smoothstep(0.75, 0.35, oc), cw.w);
    const w = step(0, idf).mul(frente).mul(reserva).mul(this.uAtiva).mul(this.uCaptura.oneMinus()).toVar('rfW');
    return { P, i, mn, mx, c: cw.xyz, w };
  }
  /* a radiância da sonda do cômodo na direção R (rugosidade → nível), já na pré-exposição do quadro */
  _radiancia(b, R, rug) {
    const T = this.T, L = NIVEIS;
    const sR = vec3(select(R.x.greaterThanEqual(0), float(1), float(-1)), select(R.y.greaterThanEqual(0), float(1), float(-1)), select(R.z.greaterThanEqual(0), float(1), float(-1)));
    const Rs = max(abs(R), vec3(1e-5)).mul(sR);
    const tf = max(b.mx.sub(b.P).div(Rs), b.mn.sub(b.P).div(Rs));
    const t = max(min(min(tf.x, tf.y), tf.z), 0);
    const o = octaCodT(normalize(b.P.add(R.mul(t)).sub(b.c)));
    const lv = clamp(rug, 0, 1).mul(L - 1), l0 = floor(lv), l1 = min(l0.add(1), L - 1), f = lv.sub(l0);
    const vy = float(b.i).mul(T).add(0.5).add(o.y.mul(T - 1)).div(this.uAltura);
    const ux = (l) => l.mul(T).add(0.5).add(o.x.mul(T - 1)).div(L * T);
    const s0 = this.atlasNo.sample(vec2(ux(l0), vy)).level(0).rgb, s1 = this.atlasNo.sample(vec2(ux(l1), vy)).level(0).rgb;
    return mix(s0, s1, f).mul(this.uEsc);
  }
  aplicar(builder, ctx, oc) {
    if (this.desligado) return;
    this._p = null;
    const b = this._prep(oc);
    ctx.radiance.assign(mix(ctx.radiance, this._radiancia(b, refletido(roughness, normalView), roughness), b.w));
    const cc = ctx.lightingModel && ctx.lightingModel.clearcoatRadiance;
    if (cc) {
      cc.assign(mix(cc, this._radiancia(b, refletido(clearcoatRoughness, clearcoatNormalView), clearcoatRoughness), b.w));
      /* piso com reflexo PLANAR: a camada de verniz reflete a cena exata, desfocada pela rugosidade dela (mip) */
      const pl = builder.material && builder.material.userData && builder.material.userData.planar;
      if (pl) {
        const lod = clamp(clearcoatRoughness.mul(18), 0, 6);
        cc.assign(mix(cc, pl.level(lod).rgb, this.uPlanar.mul(this.uCaptura.oneMinus())));
      }
    }
    this._p = null;
  }

  /* ------------------------------------------------ piso brilhante grande (reflexo planar) */
  /* gancho no laço dos grupos do motor: guarda o piso brilhante para separar por plano (devolve true = o motor não adiciona) */
  pegarPiso(geo, m, p) {
    if (this.desligado || !this.q.planos || !p || !m || p.transmissao > 0 || p.metalicidade > 0.5) return false;
    const verniz = (p.clearcoat || 0) >= 0.3 && (p.clearcoatRugosidade == null ? 1 : p.clearcoatRugosidade) <= 0.3;
    if (!verniz && !(p.rugosidade <= 0.3)) return false;
    this._pisos.push({ geo, m, p }); return true;
  }
  _subGeo(geo, tri) {
    const mapa = new Map(), novos = [], idx = new Uint32Array(tri.length);
    for (let k = 0; k < tri.length; k++) { let v = mapa.get(tri[k]); if (v === undefined) { v = novos.length; mapa.set(tri[k], v); novos.push(tri[k]); } idx[k] = v; }
    const g = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach((nome) => {
      const a = geo.getAttribute(nome); if (!a) return;
      const it = a.itemSize, arr = new Float32Array(novos.length * it);
      for (let k = 0; k < novos.length; k++) for (let c = 0; c < it; c++) arr[k * it + c] = a.array[novos[k] * it + c];
      g.setAttribute(nome, new THREE.BufferAttribute(arr, it));
    });
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingBox();
    return g;
  }
  /* depois do laço: os N maiores planos de piso (de todos os pisos brilhantes) ganham o refletor; o resto volta como era */
  montarPisos(sc) {
    const v = this.vivo, cand = [];
    this._pisos.forEach((c) => {
      const pos = c.geo.getAttribute('position').array, id = c.geo.index ? c.geo.index.array : null;
      c.r = planosDoPiso(pos, id, 0.01); c.escolhidos = [];
      c.r.planos.forEach((pl) => cand.push({ c, pl }));
    });
    /* por ALTURA (o piso de cada pavimento): um refletor por altura, no maior plano dela — dois refletores no mesmo plano
       eram duas cenas a mais por quadro (Casa 487: o porcelanato areia e o externo, os dois no térreo) */
    const alturas = [];
    cand.forEach((x) => { let a = alturas.find((h) => Math.abs(h.y - x.pl.y) < 0.01); if (!a) { a = { y: x.pl.y, area: 0, maior: null }; alturas.push(a); } a.area += x.pl.area; if (!a.maior || x.pl.area > a.maior.pl.area) a.maior = x; });
    alturas.sort((a, b) => b.area - a.area);
    alturas.slice(0, this.q.planos).filter((a) => a.maior.pl.area >= 6).forEach((a) => a.maior.c.escolhidos.push(a.maior.pl));
    this._pisos.forEach((c) => {
      const resto = c.r.resto.slice();
      c.r.planos.forEach((pl) => { if (c.escolhidos.indexOf(pl) < 0) for (let k = 0; k < pl.tri.length; k++) resto.push(pl.tri[k]); });
      if (!c.escolhidos.length) { const ms = new THREE.Mesh(c.geo, c.m); ms.castShadow = true; ms.receiveShadow = true; sc.add(ms); return; }
      if (resto.length) { const ms = new THREE.Mesh(this._subGeo(c.geo, resto), c.m); ms.castShadow = true; ms.receiveShadow = true; sc.add(ms); }
      c.escolhidos.forEach((pl) => {
        const refl = reflector({ resolutionScale: this.q.escPlanar, generateMipmaps: true, bounces: false });
        refl.target.position.set((pl.min[0] + pl.max[0]) / 2, pl.y + 0.0005, (pl.min[1] + pl.max[1]) / 2);
        refl.target.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
        refl.target.updateMatrixWorld(); sc.add(refl.target);
        this.limitar(refl, new THREE.Box3(new THREE.Vector3(pl.min[0], pl.y - 0.05, pl.min[1]), new THREE.Vector3(pl.max[0], pl.y + 0.05, pl.max[1])).expandByScalar(0.3), { semEntorno: true });   /* [frente P] */
        const mat = v._material(c.p); mat.userData.planar = refl; mat.userData.id = c.p.id;
        const ms = new THREE.Mesh(this._subGeo(c.geo, pl.tri), mat); ms.castShadow = true; ms.receiveShadow = true; ms.userData.pisoPlanar = true;
        sc.add(ms);
        this.planos.push({ refl, mat, malha: ms, base: c.m, area: Math.round(pl.area * 10) / 10, y: Math.round(pl.y * 1000) / 1000, material: c.p.id });
      });
      c.geo.dispose();
    });
    this._pisos = [];
    this.info.planos = this.planos.map((p) => ({ material: p.material, area: p.area, y: p.y }));
  }

  /* ------------------------------------------------ os cômodos e a captura */
  /* os cômodos do BIM (editor: ambientes com contorno; IFC: IfcSpace) em coordenadas do motor */
  static coletar(origem) {
    const G = typeof globalThis !== 'undefined' ? globalThis : window, o = origem || [0, 0, 0], amb = [], caixas = [];
    try {
      const st = G.BIM && G.BIM.editarEstado && G.BIM.editarEstado(), lista = (st && st.estado && st.estado.ambientes) || [];
      lista.forEach((a) => {
        const c = a && a.calc; if (!c || !c.contorno || !c.contorno.length) return;
        /* pátio/jardim "céu aberto": não é cômodo (o reflexo ali é o céu) */
        if (/c[eé]u\s*aberto|descoberto|^aberto$/i.test(String(a.acabForro || ''))) return;
        const pt = (p) => [(p.x != null ? p.x : p[0]) - o[0], (p.z != null ? p.z : p[1]) - o[2]];
        amb.push({ nome: a.nome, contorno: c.contorno.map(pt), furos: (c.furos || []).map((f) => (f || []).map(pt)), base: c.base - o[1], topo: c.topo - o[1] });
      });
    } catch (e) { /* sem editor */ }
    try {
      const F = G.BIM && G.BIM.renderFonte && G.BIM.renderFonte(), bx = new THREE.Box3(), porId = {};
      (F && F.modelos || []).forEach((mo) => {
        if (!mo.grupo || mo.mid === 'edit') return;
        mo.grupo.updateMatrixWorld(true);
        mo.grupo.children.forEach((m) => {
          if (!m.isMesh || String(m.userData && m.userData.tipo || '').toUpperCase() !== 'IFCSPACE' || !m.geometry) return;
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          bx.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
          const k = mo.mid + ':' + m.userData.expressID, b = porId[k] || (porId[k] = { nome: 'IfcSpace ' + m.userData.expressID, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
          ['x', 'y', 'z'].forEach((e, j) => { b.min[j] = Math.min(b.min[j], bx.min[e] - o[j]); b.max[j] = Math.max(b.max[j], bx.max[e] - o[j]); });
        });
      });
      Object.keys(porId).forEach((k) => caixas.push(porId[k]));
    } catch (e) { /* sem IFC */ }
    return { ambientes: amb, caixas };
  }

  /* depois do pipeline montado: salas, grade, atlas, cubo, pré-filtro — e compila (sem travar o quadro) a variante do material da captura */
  preparar(cena) {
    this.limparSalas();
    if (this.desligado) return;
    const v = this.vivo, origem = (cena && cena.origem) || (globalThis.BimRender && globalThis.BimRender._ext && globalThis.BimRender._ext.origem) || [0, 0, 0];
    const col = ReflexoObra.coletar(origem), cc = v.caixaCasa;
    const obra = cc && !cc.isEmpty() ? { min: cc.min.toArray(), max: cc.max.toArray() } : null;
    const t0 = performance.now(), r = salasDe({ ambientes: col.ambientes, caixas: col.caixas, obra, passo: 0.2, teto: MAX_SALAS });
    this.salas = r.salas; this.grade = r.grade;
    this.info = Object.assign(this.info, { salas: this.salas.length, nomes: this.salas.map((s) => s.nome), origemSalas: col.ambientes.length ? 'ambientes' : (col.caixas.length ? 'IfcSpace' : 'caixa da obra'), msGrade: Math.round(performance.now() - t0), capturas: 0, pronta: false });
    if (!this.salas.length) return;
    const T = this.T, L = NIVEIS, n = this.salas.length;
    /* a grade (Data3D, 1 byte por célula) */
    const G = this.grade, gt = new THREE.Data3DTexture(G.dados, G.n[0], G.n[1], G.n[2]);
    gt.format = THREE.RedFormat; gt.type = THREE.UnsignedByteType; gt.minFilter = gt.magFilter = THREE.NearestFilter; gt.wrapS = gt.wrapT = gt.wrapR = THREE.ClampToEdgeWrapping; gt.unpackAlignment = 1; gt.needsUpdate = true;
    this._gradeTex = gt; this.gradeNo.value = gt;
    this.uGOrig.value.fromArray(G.origem); this.uGTam.value.set(G.n[0] * G.passo, G.n[1] * G.passo, G.n[2] * G.passo);
    this.salas.forEach((s, k) => {
      this.uCx.array[k * 3].set(s.min[0], s.min[1], s.min[2], 0); this.uCx.array[k * 3 + 1].set(s.max[0], s.max[1], s.max[2], 0);
      this.uCx.array[k * 3 + 2].set(s.centro[0], s.centro[1], s.centro[2], s.reserva ? 1 : 0);
    });
    /* o ATLAS: uma linha por cômodo, um ladrilho T × T por nível de rugosidade */
    this.atlas = new THREE.RenderTarget(L * T, n * T, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.atlas.texture.name = 'Reflexo.atlas';
    /* o cubo da captura (reaproveitado por todas as sondas) com mips para o pré-filtro */
    this.cubo = new THREE.CubeRenderTarget(this.S, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    this.cubo.texture.name = 'Reflexo.cubo';
    this.cam = new THREE.CubeCamera(0.05, 400, this.cubo);
    /* ⚠ a textura nasce na placa como ALVO DE DESENHO antes de qualquer material ler: se o 1º uso é como textura lida, o
       three a recria ao desenhar nela e os desenhos já montados (as faces da captura) seguem com a velha — o envio
       inteiro caía ("Destroyed texture [Reflexo.atlas] used in a submit") e as sondas saíam todas iguais (20/10/2026) */
    { const r = v.renderer, rtA = r.getRenderTarget(), mrtA = r.getMRT(); r.setMRT(null);
      r.setRenderTarget(this.atlas); r.clear(); for (let f = 0; f < 6; f++) { r.setRenderTarget(this.cubo, f, 0); r.clear(); }
      r.setRenderTarget(rtA); r.setMRT(mrtA); }
    this.atlasNo.value = this.atlas.texture; this.uAltura.value = n * T;
    this._montarFiltro();
    /* vidro e espelho saem da captura: a sonda vê através da janela (o vidro deixa passar ~90 %; a transmissão do three
       dentro de um cubo leria a tela errada) */
    this._ocultar = [];
    v.scene.traverse((o) => { if (o.isMesh && o.material && (o.material.transmission > 0 || o.userData.espelho)) this._ocultar.push(o); });
    const W = L * T, H = n * T, mb = (b) => Math.round(b / 1048576 * 10) / 10;
    this.info.atlas = W + '×' + H;
    this.info.memoriaMB = { atlas: mb(W * H * 8), cubo: mb(this.S * this.S * 6 * (8 * 4 / 3 + 4)), grade: mb(G.dados.length), planar: mb(this.planos.length * this._bytesPlanar()) };
    this.info.memoriaMB.total = Math.round((this.info.memoriaMB.atlas + this.info.memoriaMB.cubo + this.info.memoriaMB.grade + this.info.memoriaMB.planar) * 10) / 10;
    /* a variante da captura compila DEPOIS do 1º quadro (quadro()): antes dele o mapa de sombra do sol ainda não existe
       como alvo de desenho e os desenhos da captura ficavam presos a uma textura de sombra vazia — a sonda via o sol
       entrando pelo telhado (8 × mais clara que a cena; 20/10/2026) */
    this._compilou = false;
  }
  _bytesPlanar() { const r = this.vivo.renderer, s = new THREE.Vector2(); r.getDrawingBufferSize(s); const w = s.x * this.q.escPlanar, h = s.y * this.q.escPlanar; return w * h * (8 * 4 / 3 + 4); }
  _montarFiltro() {
    const T = this.T, L = NIVEIS, K = this.K, A = amostrasGGX(L, K, this.S);
    const arr = []; for (let k = 0; k < A.length; k += 4) arr.push(new THREE.Vector4(A[k], A[k + 1], A[k + 2], A[k + 3]));
    const am = this._am = uniformArray(arr, 'vec4');
    this.uLinha = uniform(0);
    this.cuboNo = cubeTexture(this.cubo.texture);
    /* ⚠ DENTRO de um Fn: o laço e os acumuladores são COMANDOS — fora de um Fn o three os descarta e os níveis 1–5 saíam pretos */
    const lod0 = Math.max(0, Math.log2(this.S / T) + 0.5 * Math.log2(6));
    const frag = Fn(() => {
    const pix = screenCoordinate.xy, lf = floor(pix.x.div(T));
    const o = vec2(pix.x.sub(lf.mul(T)), pix.y.sub(this.uLinha.mul(T))).sub(0.5).div(T - 1);
    const N = octaDecT(clamp(o, 0, 1)).toVar();
    const up = select(abs(N.y).lessThan(0.999), vec3(0, 1, 0), vec3(1, 0, 0));
    const Tx = normalize(cross(up, N)).toVar(), By = cross(N, Tx).toVar();
    const acc = vec3(0).toVar(), ws = float(0).toVar(), base = int(max(lf.sub(1), 0)).mul(K).toVar();
    Loop({ start: 0, end: K, type: 'int' }, ({ i }) => {
      const s = am.element(base.add(i));
      const Ld = Tx.mul(s.x).add(By.mul(s.y)).add(N.mul(s.z)), wg = max(s.z, 0);
      acc.addAssign(this.cuboNo.sample(Ld).level(s.w).rgb.mul(wg)); ws.addAssign(wg);
    });
    /* nível 0 (espelho): o cubo direto, no mip que casa o texel do ladrilho com o do cubo */
    return vec4(select(lf.lessThan(0.5), this.cuboNo.sample(N).level(lod0).rgb, acc.div(max(ws, 1e-4))), 1);
    });
    const mat = this._matFiltro = new THREE.NodeMaterial();
    mat.depthTest = false; mat.depthWrite = false; mat.blending = THREE.NoBlending; mat.name = 'Reflexo.prefiltro';
    mat.fragmentNode = frag();
    this._quad = new THREE.QuadMesh(mat);
  }
  async _compilar() {
    const r = this.vivo.renderer, rtA = r.getRenderTarget(), mrtA = r.getMRT(), tok = this._tok = (this._tok || 0) + 1;
    this._compilando = true;
    let p = null;
    try { r.setMRT(null); r.setRenderTarget(this.cubo, 0); p = r.compileAsync(this.vivo.scene, this.cam.children[0]); }
    catch (e) { p = null; }
    finally { r.setRenderTarget(rtA); r.setMRT(mrtA); }
    try { if (p) await p; } catch (e) { /* compila no 1º uso */ }
    if (tok === this._tok) this._compilando = false;
  }

  /* a luz mudou? (hora/céu, luz assada, sondas de luz, luminárias) — então as sondas de reflexo são refeitas */
  _assinatura() {
    const v = this.vivo, ls = Object.values(v.luzes || {}).map((l) => (l.visible ? 1 : 0)).join('');
    /* a VERSÃO da textura também: a luz da obra e a luz assada agora trocam os dados no lugar (mesmo objeto) */
    const tv = (t) => (t ? t.uuid + ':' + t.version : '');
    const sol = v.sol ? [v.sol.uuid, v.sol.intensity > 0 ? v.sol.userData.base : 0, v.sol.position.x.toFixed(2), v.sol.position.y.toFixed(2), v.sol.position.z.toFixed(2)].join(',') : '';
    return [tv(v._ceu), sol, tv(v.lm && v.lm.tex), v.lm && v.lm.uAtiva.value, tv(v.luz && v.luz.tex && v.luz.tex[0]), v.luz && v.luz.uAtiva.value, ls].join('|');
  }
  /* gancho no laço do motor, logo depois do quadro desenhado: UMA sonda por quadro quando há fila */
  quadro() {
    if (!this.salas.length || !this.atlas) return;
    /* só com a luz da obra de verdade na placa (sondas e, se houver, o atlas): os desenhos da captura nascem presos às
       texturas do momento — nascer com as vazias deixava a sonda sem a luz rebatida */
    if (!this._compilou) {
      const v0 = this.vivo; if (!(v0.luz && v0.luz.uAtiva.value) || (v0.assada && v0.uvInfo && !v0.lm.uAtiva.value)) return;
      this._compilou = true; this._compilar(); return;
    }
    const v = this.vivo, agora = performance.now();
    this.uEsc.value = (v.k || K_CAPTURA) / K_CAPTURA;
    const s = this._assinatura();
    if (s !== this._sig) { this._sig = s; this._fila = this.salas.map((x, k) => k); this._cap = null; this._tMudou = agora; }
    /* espera a luz assentar (300 ms) e a compilação da variante da captura */
    if ((!this._fila.length && !this._cap) || this._compilando || agora - this._tMudou < 300) return;
    /* UMA FACE POR QUADRO (6 quadros por cômodo): a sonda inteira num quadro custava ~17 ms de CPU (um quadro perdido) */
    if (!this._cap) this._cap = { k: this._fila.shift(), face: 0 };
    const t = performance.now();
    this.capturar(this._cap.k, this._cap.face);
    this._ms.push(performance.now() - t); if (this._ms.length > 96) this._ms.shift();
    if (++this._cap.face < 6) return;
    this._cap = null;
    if (!this._fila.length) {
      this.uAtiva.value = 1; this.info.capturas++; this.info.pronta = true;
      this.info.msCpuFace = Math.round(this._ms.reduce((a, b) => a + b, 0) / this._ms.length * 10) / 10;
      this.info.msUltimaRodada = Math.round(agora - this._tMudou);
    }
  }
  /* face: 0–5 desenha só essa face (e a 5 gera os mips e pré-filtra); sem face, as 6 de uma vez (diagnóstico) */
  capturar(k, face) {
    const v = this.vivo, r = v.renderer, sc = v.scene, s = this.salas[k]; if (!s) return;
    const faces = face == null ? [0, 1, 2, 3, 4, 5] : [face];
    const kAnt = v.k, sh = v.sol && v.sol.shadow, autoSh = sh ? sh.autoUpdate : true;
    const rtA = r.getRenderTarget(), mrtA = r.getMRT(), acA = r.autoClear;
    this._ocultar.forEach((o) => { o.userData._rfVis = o.visible; o.visible = false; });
    try {
      v._preExpor(K_CAPTURA); this.uCaptura.value = 1;
      /* a sombra do sol não depende da câmera: as 6 faces usam a do quadro (sem isso eram 6 mapas 8192² por sonda) */
      if (sh) sh.autoUpdate = false;
      r.setMRT(null);
      if (this.cam.coordinateSystem !== r.coordinateSystem) { this.cam.coordinateSystem = r.coordinateSystem; this.cam.updateCoordinateSystem(); }
      this.cam.position.set(s.centro[0], s.centro[1], s.centro[2]); this.cam.updateMatrixWorld(true);
      /* número de desenho que nunca se repete: o three r186 numera os desenhos pelo info.calls, que ZERA a cada quadro, e
         pula a atualização de uniformes de um objeto já visto com o mesmo número (a face f do cômodo seguinte cai no mesmo) */
      this._seq = (this._seq || 0) + 1; r.info.calls = Math.max(r.info.calls, 1e6 + this._seq * 64);
      /* ⚠ os mips do cubo ficam LIGADOS em toda face (o three refaz a cadeia a cada face — barato a 128 px): desligar nas
         5 primeiras, como faz o CubeCamera.update, deixou o pré-filtro lendo um cubo velho — todas as sondas iguais (20/10/2026) */
      faces.forEach((f) => { r.autoClear = true; r.setRenderTarget(this.cubo, f, 0); r.render(sc, this.cam.children[f]); });
      if (faces.indexOf(5) >= 0) {
        /* o pré-filtro escreve só a linha deste cômodo (viewport; sem limpar o resto do atlas) */
        r.autoClear = false; this.uLinha.value = k;
        this.atlas.viewport.set(0, k * this.T, NIVEIS * this.T, this.T); this.atlas.scissor.copy(this.atlas.viewport);
        r.setRenderTarget(this.atlas); this._quad.render(r);
      }
    } catch (e) { this.info.erro = String(e && e.message || e); }
    finally {
      r.setRenderTarget(rtA); r.setMRT(mrtA); r.autoClear = acA;
      if (sh) { sh.autoUpdate = autoSh; }
      this._ocultar.forEach((o) => { o.visible = o.userData._rfVis !== false; });
      this.uCaptura.value = 0; v._preExpor(kAnt);
    }
  }

  /* ------------------------------------------------ [frente P] CADÊNCIA DOS REFLETORES (piso planar e espelhos exatos)
     Cada refletor do three redesenha a CENA INTEIRA do ponto de vista espelhado, uma vez por quadro, mesmo com a câmera parada e
     mesmo fora da tela. Medido na Casa 487 em Ultra (RTX 5060, 21/10/2026): 3 refletores (o piso + 2 espelhos) eram 716 dos 966
     desenhos da cena e ~16 dos 25 ms de CPU de cada quadro — a placa ficava a 5–10 ms e o tempo real a 36–40 qps (sem o reflexo: 60).
     Agora cada refletor só desenha quando o que ele mostra mudou:
       · fora do campo de visão: nada (a textura fica como está);
       · câmera PARADA e nada mudou (luz, exposição, materiais 2K, liga/desliga): nada — depois de parar desenha mais algumas
         imagens espaçadas (o TRAA mistura os sub-pixels de cada uma, e o reflexo fica tão limpo quanto antes);
       · câmera MEXENDO: meio ritmo, escalonado entre os refletores (a defasagem de 1 quadro, 16 ms, não se vê num reflexo);
       · mudou a luz, a pré-exposição (o olho adaptando), os materiais 2K ou o botão: desenha na hora.
     `refl` é o ReflectorNode do three; `caixa` (Box3 do mundo, opcional) é o que decide "está na tela"; opcoes.semEntorno tira a
     grama e as árvores (camada 1) do que o piso reflete (reflexo borrado: as lâminas só custavam desenhos). */
  limitar(refl, caixa, opcoes) {
    const base = refl && refl.reflector; if (!base || base._cadencia) return null;
    const orig = base.updateBefore, self = this, porCamera = new WeakMap(), reg = { base, caixa: caixa || null, fase: this._refletores.length & 1, ver: 0, n: 0, pulados: 0, fora: 0 };
    base._cadencia = reg; this._refletores.push(reg);
    if (opcoes && opcoes.semEntorno) { try { base.getVirtualCamera(this.vivo.camera).layers.disable(1); } catch (e) { /* sem a câmera virtual ainda: o entorno só custa desenhos */ } }
    base.updateBefore = function (frame) {
      /* captura de sonda: o cubo é desenhado com a câmera de cada face e o shader zera o piso planar (uCaptura) — o refletor desenharia a cena
         inteira de novo por face, criando uma textura de 816 × 370 por câmera ("Destroyed texture … used in a submit", 377 erros por rodada na Casa 487) */
      if (self.uCaptura.value) return;
      const cam = frame.camera;
      if (self.cadencia === false || !cam) { reg.n++; return orig.call(this, frame); }
      let e = porCamera.get(cam); if (!e) { e = { render: new Float32Array(16), prev: new Float32Array(16), ok: false, k: 0, sig: '', m2: -1, ver: -1, extra: 0 }; porCamera.set(cam, e); }
      const el = cam.matrixWorld.elements, v = self.vivo, q = v._quadros | 0;
      let dPose = 0, mov = 0;
      for (let i = 0; i < 16; i++) { const a = Math.abs(el[i] - e.render[i]); if (a > dPose) dPose = a; const b = Math.abs(el[i] - e.prev[i]); if (b > mov) mov = b; e.prev[i] = el[i]; }
      if (reg.caixa && !self._naTela(cam, reg.caixa, q)) { reg.fora++; return; }
      const m2 = v.mat2k && v.mat2k.aplicados ? v.mat2k.aplicados.length : 0, sig = self._sigDoQuadro(q);
      const dk = Math.abs(v.k - e.k) > 0.04 * e.k, mudou = !e.ok || sig !== e.sig || m2 !== e.m2 || reg.ver !== e.ver || dk;
      if (mudou) { const c = reg.causas || (reg.causas = { novo: 0, luz: 0, mat2k: 0, botao: 0, exposicao: 0 }); if (!e.ok) c.novo++; else if (sig !== e.sig) c.luz++; else if (m2 !== e.m2) c.mat2k++; else if (reg.ver !== e.ver) c.botao++; else c.exposicao++; }
      const moveu = dPose > 1e-4;
      if (!mudou) {
        if (!moveu && e.extra <= 0) { reg.pulados++; return; }
        if (moveu && mov > 1e-5 && ((q + reg.fase) & 1)) { reg.pulados++; return; }   /* mexendo: meio ritmo, escalonado */
        if (!moveu) { if ((q + reg.fase) & 1) { reg.pulados++; return; } e.extra--; }  /* assentando: mais algumas imagens espaçadas */
        else e.extra = 6;
      } else e.extra = 6;
      for (let i = 0; i < 16; i++) e.render[i] = el[i];
      e.sig = sig; e.m2 = m2; e.ver = reg.ver; e.k = v.k; e.ok = true; reg.n++;
      return orig.call(this, frame);
    };
    return reg;
  }
  /* o refletor está no campo de visão? (a caixa já vem com folga) — o frustum é refeito uma vez por quadro e câmera */
  _naTela(cam, caixa, q) {
    if (this._fq !== q || this._fcam !== cam) {
      this._fq = q; this._fcam = cam;
      if (!this._fm) { this._fm = new THREE.Matrix4(); this._fr = new THREE.Frustum(); }
      this._fm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this._fr.setFromProjectionMatrix(this._fm, cam.coordinateSystem);
    }
    return this._fr.intersectsBox(caixa);
  }
  _sigDoQuadro(q) { if (this._sq !== q) { this._sq = q; this._sv = this._assinatura(); } return this._sv; }
  /* manda todos os refletores desenharem de novo no próximo quadro (ligar/desligar, qualquer mudança que a cadência não enxerga) */
  refazerRefletores() { this._refletores.forEach((r) => { r.ver++; }); if (this.vivo.mexeu) this.vivo.mexeu(); }
  /* diagnóstico: quantas vezes cada refletor desenhou, pulou e ficou fora da tela */
  estatRefletores() { return this._refletores.map((r) => ({ desenhou: r.n, pulou: r.pulados, foraDaTela: r.fora, causas: r.causas || null })); }
  /* o piso planar sem o refletor (o material de antes): para medir o custo do refletor */
  planarLigado(on) { this.planos.forEach((p) => { if (!p.malha) return; p.malha.material = on ? p.mat : p.base; }); this.refazerRefletores(); return !!on; }
  /* liga/desliga (comparação antes × depois na mesma sessão) */
  ligado(on) { this.uAtiva.value = on && this.info.pronta ? 1 : 0; this.uPlanar.value = on ? 1 : 0; this.refazerRefletores(); return !!on; }

  /* DIAGNÓSTICO: o atlas como imagem (curva simples) — para conferir orientação e paralaxe a olho */
  async atlasPNG() {
    if (!this.atlas) return null;
    const r = this.vivo.renderer, w = this.atlas.width, h = this.atlas.height;
    const px = await r.readRenderTargetPixelsAsync(this.atlas, 0, 0, w, h, 0), f = px instanceof Uint16Array ? THREE.DataUtils.fromHalfFloat : (x) => x;
    const passo = Math.ceil(w * 4 * px.BYTES_PER_ELEMENT / 256) * 256 / px.BYTES_PER_ELEMENT;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d'), im = cx.createImageData(w, h);
    let soma = 0; for (let j = 0; j < h; j += 4) for (let i = 0; i < w; i += 4) { const q = j * passo + i * 4; soma += f(px[q]) + f(px[q + 1]) + f(px[q + 2]); }
    const med = soma / (3 * (w / 4) * (h / 4)) || 1, ex = 0.18 / med;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const q = j * passo + i * 4, o = (j * w + i) * 4;
      for (let c = 0; c < 3; c++) { const x = f(px[q + c]) * ex; im.data[o + c] = Math.round(255 * Math.pow(x / (1 + x), 1 / 2.2)); }
      im.data[o + 3] = 255;
    }
    cx.putImageData(im, 0, 0); return cv.toDataURL('image/png');
  }

  limparSalas() {
    this._tok = (this._tok || 0) + 1; this._compilando = false;
    if (this.atlas) { try { this.atlas.dispose(); } catch (e) { /* já descartado */ } this.atlas = null; }
    if (this.cubo) { try { this.cubo.dispose(); } catch (e) { /* já descartado */ } this.cubo = null; }
    if (this._gradeTex) { const g = this._gradeTex; this._gradeTex = null; setTimeout(() => { try { g.dispose(); } catch (e) { /* já */ } }, 3000); }
    if (this._matFiltro) { try { this._matFiltro.dispose(); } catch (e) { /* já */ } this._matFiltro = null; }
    this.atlasNo.value = this._atlasVazio; this.gradeNo.value = this._gradeVazia;
    this.uAtiva.value = 0; this.salas = []; this.grade = null; this._fila = []; this._cap = null; this._sig = ''; this._ocultar = [];
  }
  /* a cena vai ser desmontada (o motor descarta geometrias e materiais; aqui os refletores e as texturas) */
  limpar() {
    this.planos.forEach((p) => { try { p.refl.dispose(); } catch (e) { /* sem dispose nesta versão */ } });
    this.planos = []; this._pisos = []; this.info.planos = []; this._refletores = [];   /* [frente P] o motor refaz os dos espelhos ao montar a cena */
    this.limparSalas();
  }
  descartar() { this.limpar(); [this._atlasVazio, this._gradeVazia].forEach((t) => { try { t.dispose(); } catch (e) { /* já */ } }); }
}

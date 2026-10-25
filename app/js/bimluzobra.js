/* =====================================================================
 * bimluzobra.js — A LUZ DA OBRA CALCULADA UMA VEZ (módulo ES, protótipo
 * 20/10/2026; usado pelo js/bimrendervivo.js). Também é o próprio WORKER
 * do cálculo (o mesmo arquivo, carregado como `new Worker(…, {type:'module'})`).
 *
 * O problema que isto resolve (o mesmo que o Lumen do Unreal resolve a
 * cada quadro): a luz do céu "vaza" para dentro de casa. Sem saber que há
 * laje e parede, o tempo real ilumina a sala com o céu inteiro — a imagem
 * fica azulada e chapada. Os programas de jogo recalculam isso o tempo
 * todo porque a cena deles se mexe; a OBRA NÃO SE MEXE. Então a luz
 * indireta é calculada UMA VEZ, por raio, ao abrir (e de novo só quando a
 * hora do sol muda), e o tempo real só a consulta.
 *
 * Como: uma GRADE DE SONDAS (~0,5 m) na caixa da casa. De cada sonda saem
 * N raios (esfera de Fibonacci girada ao acaso por sonda):
 *   · o raio que escapa traz a radiância do CÉU naquela direção (cd/m²);
 *   · o que bate numa face traz a luz que ELA devolve: albedo/π × (sol
 *     direto na face, com raio de sombra + a luz indireta da passada
 *     anterior) — 2 passadas = luz que rebate duas vezes;
 *   · o que bate no VERSO de uma face diz que a sonda está dentro da
 *     parede: ela é marcada INVÁLIDA (alfa −1) e não entra em média nenhuma.
 * Cada sonda guarda um "cubo de luz" (Valve, 2006): a irradiância em lux
 * nas 6 direções ±x ±y ±z, e a fração de céu visível (para tirar o
 * reflexo do céu de quem está dentro de casa). O sol DIRETO não entra
 * aqui: ele vem da luz direcional com mapa de sombra, no tempo real.
 *
 * ⚠ VAZAMENTO ATRAVÉS DA PAREDE (medido em 20/10/2026 na Casa 487: manchas
 *   escuras no muro e no alto do estar): parede de 15 cm e sondas a 0,46 m
 *   — a sonda do outro lado entra na média. A consulta pesa cada sonda
 *   pelo lado da face (a que está ATRÁS da normal pesa zero — a ideia do
 *   DDGI, Majercik et al. 2019, sem o teste de Chebyshev) e ignora as
 *   inválidas. Preencher a inválida com a média das vizinhas (a 1ª versão)
 *   misturava os dois lados da parede: não fazer.
 *
 * Unidades: lux (lm/m²), as mesmas do motor físico. Na placa vai em klux
 * (÷ 1000) por causa do teto do meio-float.
 * ===================================================================== */
import * as THREE from '../bim/vendor/jsm/pathtracer/three/three.core.js';
import { MeshBVH } from '../bim/vendor/jsm/pathtracer/three-mesh-bvh.module.js';
import { luzesParaPlaca, luzNoPonto } from './bimluzluminarias.js';

const EIXOS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function fibonacci(n) {
  const d = new Float32Array(n * 3), g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), t = g * i;
    d[i * 3] = Math.cos(t) * r; d[i * 3 + 1] = y; d[i * 3 + 2] = Math.sin(t) * r;
  }
  return d;
}

/* o céu equirretangular (a mesma convenção do equirectUV do three: u = atan2(z,x)/2π + ½, v = asin(y)/π + ½) */
function amostraCeu(ceu, x, y, z, o) {
  const u = Math.atan2(z, x) / (2 * Math.PI) + 0.5, v = Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI + 0.5;
  const px = Math.min(ceu.largura - 1, Math.max(0, Math.floor(u * ceu.largura))), py = Math.min(ceu.altura - 1, Math.max(0, Math.floor(v * ceu.altura)));
  const i = (py * ceu.largura + px) * 4;
  o[0] = ceu.dados[i]; o[1] = ceu.dados[i + 1]; o[2] = ceu.dados[i + 2];
}
/* o céu reduzido para o cálculo (a luz do céu é de baixa frequência; 1024 × 512 em cada worker seria 8 MB à toa) */
function reduzirCeu(ceu, f) {
  if (!ceu || ceu.largura <= 256) return ceu;
  const W = Math.floor(ceu.largura / f), H = Math.floor(ceu.altura / f), d = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) {
    let s = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += ceu.dados[((y * f + j) * ceu.largura + (x * f + i)) * 4 + c];
    d[(y * W + x) * 4 + c] = s / (f * f);
  }
  return { largura: W, altura: H, dados: d };
}

/* a cor MÉDIA de uma textura (linear): o albedo de quem tem mapa de cor */
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
function mediaImagem(img) {
  try {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += lin(d[i]); gg += lin(d[i + 1]); b += lin(d[i + 2]); }
    return [r / 64, gg / 64, b / 64];
  } catch (e) { return null; }
}

/* o albedo (linear, 0..0,9) de um material do motor ao vivo */
export function albedoDe(m) {
  if (!m) return [0.5, 0.5, 0.5];
  if (m.userData && m.userData.albedo) return m.userData.albedo;
  const c = m.color ? [m.color.r, m.color.g, m.color.b] : [0.5, 0.5, 0.5];
  let t = null;
  /* [frente E2] material 2K (js/bimmat2k.js): o mapa vai para o grafo e m.map fica nulo — a cor média sai do 1K guardado */
  const mp = m.map || m.mapaAlbedo, img = mp && mp.image;
  if (img && (img.width || img.data)) {
    if (img.data && img.width) {   /* DataTexture (rejunte): média dos bytes */
      const d = img.data; let r = 0, g = 0, b = 0, n = 0; const p = Math.max(4, Math.floor(d.length / 4 / 256) * 4);
      for (let i = 0; i < d.length; i += p) { r += lin(d[i]); g += lin(d[i + 1]); b += lin(d[i + 2]); n++; }
      t = [r / n, g / n, b / n];
    } else t = mediaImagem(img);
  }
  const a = t ? [c[0] * t[0], c[1] * t[1], c[2] * t[2]] : c;
  const metal = m.metalness || 0;
  const out = a.map((v) => Math.min(0.9, v * (1 - 0.8 * metal)));
  if (m.userData) m.userData.albedo = out;
  return out;
}

/* ---------------------------------------------------------------------
 * a geometria única do cálculo: tudo que é OPACO (vidro e água ficam de
 * fora — a luz passa pela janela) + o albedo de cada triângulo
 * --------------------------------------------------------------------- */
export function geometriaDaCena(scene) {
  const pos = [], alb = [], caixaCasa = new THREE.Box3(), bb = new THREE.Box3();
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return;
    const m = o.material; if (!m || m.transmission > 0 || m.transparent) return;
    const g = o.geometry, p = g.getAttribute('position'); if (!p) return;
    o.updateMatrixWorld(true);
    const a = albedoDe(m), idx = g.index, n = idx ? idx.count : p.count, v = new THREE.Vector3(), M = o.matrixWorld;
    g.computeBoundingBox(); bb.copy(g.boundingBox).applyMatrix4(M);
    /* o chão sem fim (o terreno de 200 m) não define a caixa da grade */
    const dg = bb.getSize(new THREE.Vector3()); if (Math.max(dg.x, dg.z) < 120) caixaCasa.union(bb);
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(M); pos.push(v.x, v.y, v.z); if (i % 3 === 2) alb.push(a[0], a[1], a[2]); }
  });
  return { pos: new Float32Array(pos), albedo: new Float32Array(alb), caixa: caixaCasa };
}

/* =====================================================================
 * O NÚCLEO (roda no worker): uma faixa de sondas de uma passada
 * ===================================================================== */
function Nucleo(d) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  this.bvh = new MeshBVH(geo, { maxLeafSize: 8 });
  this.alb = d.albedo; this.g = d.grade; this.ceu = d.ceu; this.sol = d.sol;
  this.dirs = fibonacci(d.raios); this.R = d.raios;
  this.luz = d.luzes && d.luzes.n ? d.luzes : null;   /* [frente E] luminárias (js/bimluzluminarias.js) */
  /* [frente I] POR COMANDO: a direta de cada luminária vai para o grupo dela (o comando), só na ÚLTIMA passada e FORA da base —
     a tela soma os grupos acesos (js/bimcircuitos.js comporSondas): ligar um cômodo não refaz as sondas */
  this.grupos = d.grupos || null; this.nG = d.nGrupos || 0; this.ultima = false;
}
/* a irradiância de uma passada num ponto e normal: trilinear pesada pelo LADO da face (DDGI) e só nas sondas válidas */
function irradiancia(faces, g, sx, sy, sz, nx_, ny_, nz_, o) {
  o[0] = o[1] = o[2] = 0;
  const [nx, ny, nz] = g.n, P = g.passo, org = g.origem;
  /* lida meio passo à frente da face; o lado é medido do PONTO DA FACE (a mesma regra do shader no bimrendervivo.js) */
  const x = sx + nx_ * P * 0.5, y = sy + ny_ * P * 0.5, z = sz + nz_ * P * 0.5;
  const fx = (x - org[0]) / P, fy = (y - org[1]) / P, fz = (z - org[2]) / P;
  const ix = Math.max(0, Math.min(nx - 2, Math.floor(fx))), iy = Math.max(0, Math.min(ny - 2, Math.floor(fy))), iz = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - ix)), ty = Math.max(0, Math.min(1, fy - iy)), tz = Math.max(0, Math.min(1, fz - iz));
  const n2x = nx_ * nx_, n2y = ny_ * ny_, n2z = nz_ * nz_, fX = nx_ >= 0 ? 0 : 1, fY = ny_ >= 0 ? 2 : 3, fZ = nz_ >= 0 ? 4 : 5;
  let sw = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1, k = (ix + dx) + nx * ((iy + dy) + ny * (iz + dz));
    if (faces[0][k * 4 + 3] < 0) continue;
    let wt = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz);
    const vx = org[0] + (ix + dx) * P - sx, vy = org[1] + (iy + dy) * P - sy, vz = org[2] + (iz + dz) * P - sz, vl = Math.hypot(vx, vy, vz) || 1;
    const cd = (vx * nx_ + vy * ny_ + vz * nz_) / vl, tt = Math.max(0, Math.min(1, (cd - 0.02) / 0.33)); wt *= tt * tt * (3 - 2 * tt);
    if (wt <= 1e-6) continue;
    for (let ch = 0; ch < 3; ch++) o[ch] += wt * (n2x * faces[fX][k * 4 + ch] + n2y * faces[fY][k * 4 + ch] + n2z * faces[fZ][k * 4 + ch]);
    sw += wt;
  }
  if (sw > 1e-6) { o[0] /= sw; o[1] /= sw; o[2] /= sw; }
}
Nucleo.prototype.faixa = function (k0, k1) {
  const prev = this.prev || null;
  const g = this.g, [nx, ny] = g.n, P = g.passo, org = g.origem, R = this.R, dirs = this.dirs, w = 4 * Math.PI / R, alb = this.alb;
  const n = k1 - k0, out = EIXOS.map(() => new Float32Array(n * 4));
  const liga = prev ? null : new Uint8Array(n);   /* [frente E2] ligação com as vizinhas (só na 1ª passada) */
  const sd = this.sol && this.sol.lux > 0 ? new THREE.Vector3().fromArray(this.sol.direcao).normalize() : null;
  const sc = (this.sol && this.sol.cor) || [1, 1, 1], slux = this.sol ? this.sol.lux : 0;
  const ray = new THREE.Ray(), sh = new THREE.Ray(), L = [0, 0, 0], Ep = [0, 0, 0], nrm = new THREE.Vector3(), dv = new THREE.Vector3(), rot = new THREE.Matrix4(), ax = new THREE.Vector3();
  const acc = new Float64Array(18), LZ = new Float64Array(7);
  const outG = this.grupos && this.ultima ? new Float32Array(n * this.nG * 18) : null;   /* [frente I] */
  if (outG) out.grupos = outG;
  for (let k = k0; k < k1; k++) {
    const ix = k % nx, iy = Math.floor(k / nx) % ny, iz = Math.floor(k / (nx * ny));
    const px = org[0] + ix * P, py = org[1] + iy * P, pz = org[2] + iz * P;
    ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); rot.makeRotationAxis(ax, Math.random() * Math.PI * 2);
    let vis = 0, verso = 0, livre = 0; acc.fill(0);
    for (let r = 0; r < R; r++) {
      dv.set(dirs[r * 3], dirs[r * 3 + 1], dirs[r * 3 + 2]).applyMatrix4(rot);
      ray.origin.set(px, py, pz); ray.direction.copy(dv);
      const h = this.bvh.raycastFirst(ray, THREE.DoubleSide, 0, 200);
      /* VERSO de face: conta para "estou dentro da parede?" — só o verso PERTO denuncia parede: o verso do telhado visto
         de dentro da casa (a telha é superfície de um lado só) está a metros e é legítimo (20/10/2026) */
      if (h && h.face.normal.dot(dv) > 0 && h.distance < 0.6 * P) verso++;
      livre += h ? Math.min(h.distance, 10) : 10;
      if (!h) { amostraCeu(this.ceu, dv.x, dv.y, dv.z, L); vis++; }
      else {
        /* [frente E] TODA face é opaca dos DOIS lados, como no path tracer da foto física (material DoubleSide): o verso
           devolve luz com a normal virada para quem olha. ⚠ A versão anterior ATRAVESSAVA o verso uma vez — a sonda do
           estar via o céu através do telhado de um lado só (20/10/2026). */
        nrm.copy(h.face.normal); if (nrm.dot(dv) > 0) nrm.negate();
        {
          const fi = h.faceIndex;
          let es = 0;
          if (sd) { const c = nrm.dot(sd); if (c > 0) { sh.origin.copy(h.point).addScaledVector(nrm, 0.003); sh.direction.copy(sd); if (!this.bvh.raycastFirst(sh, THREE.DoubleSide, 0, 300)) es = slux * c; } }
          if (prev) irradiancia(prev, g, h.point.x, h.point.y, h.point.z, nrm.x, nrm.y, nrm.z, Ep); else Ep[0] = Ep[1] = Ep[2] = 0;
          L[0] = alb[fi * 3] / Math.PI * (es * sc[0] + Ep[0]); L[1] = alb[fi * 3 + 1] / Math.PI * (es * sc[1] + Ep[1]); L[2] = alb[fi * 3 + 2] / Math.PI * (es * sc[2] + Ep[2]);
        }
      }
      for (let e = 0; e < 6; e++) { const c = dv.x * EIXOS[e][0] + dv.y * EIXOS[e][1] + dv.z * EIXOS[e][2]; if (c > 0) { acc[e * 3] += L[0] * c; acc[e * 3 + 1] += L[1] * c; acc[e * 3 + 2] += L[2] * c; } }
    }
    /* INVÁLIDA (some das médias): dentro da parede (verso em > 25 % dos raios — o limiar do DDGI) ou presa num vão
       (distância livre média < meio passo: o vão entre duas paredes é escuro de verdade e mancharia a sala ao lado).
       ⚠ O 1º limiar (5 %) descartava 78 % das sondas da Casa 487, inclusive no meio da sala — 20/10/2026. */
    const a = (verso / R > 0.25 || livre / R < Math.max(0.25, 0.5 * P)) ? -1 : vis / R, j = (k - k0) * 4;
    for (let e = 0; e < 18; e++) acc[e] *= w;
    /* [frente E] a DIRETA das luminárias na sonda (raio de sombra até o centro de cada uma): a luz da peça sem atlas
       (louça, folhagem, vidro) à noite — e, pela passada seguinte, o rebote dela nas sondas */
    if (this.luz && a >= 0 && this.grupos) {   /* [frente I] */
      if (this.ultima) for (let q = 0; q < this.luz.n; q++) {
        luzNoPonto(this.luz, q, px, py, pz, LZ);
        if (!(LZ[0] + LZ[1] + LZ[2] > 0)) continue;
        sh.origin.set(px, py, pz); sh.direction.set(LZ[3], LZ[4], LZ[5]);
        if (LZ[6] > 0.02 && this.bvh.raycastFirst(sh, THREE.DoubleSide, 0, LZ[6] - 0.01)) continue;
        const go = ((k - k0) * this.nG + this.grupos[q]) * 18;
        for (let e = 0; e < 6; e++) { const c = LZ[3] * EIXOS[e][0] + LZ[4] * EIXOS[e][1] + LZ[5] * EIXOS[e][2]; if (c > 0) { outG[go + e * 3] += LZ[0] * c; outG[go + e * 3 + 1] += LZ[1] * c; outG[go + e * 3 + 2] += LZ[2] * c; } }
      }
    } else if (this.luz && a >= 0) {
      for (let q = 0; q < this.luz.n; q++) {
        luzNoPonto(this.luz, q, px, py, pz, LZ);
        if (!(LZ[0] + LZ[1] + LZ[2] > 0)) continue;
        sh.origin.set(px, py, pz); sh.direction.set(LZ[3], LZ[4], LZ[5]);
        if (LZ[6] > 0.02 && this.bvh.raycastFirst(sh, THREE.DoubleSide, 0, LZ[6] - 0.01)) continue;
        /* [frente E2] a sonda vale por um cubo de lado P: a luz a menos de meio passo dela não é a do cubo (1/d² explodia na sonda
           colada ao painel — milhares de lux espalhados pela interpolação nas peças sem atlas em volta da luminária) */
        const fq = Math.min(1, LZ[6] * LZ[6] / (0.25 * P * P));
        for (let e = 0; e < 6; e++) { const c = fq * (LZ[3] * EIXOS[e][0] + LZ[4] * EIXOS[e][1] + LZ[5] * EIXOS[e][2]); if (c > 0) { acc[e * 3] += LZ[0] * c; acc[e * 3 + 1] += LZ[1] * c; acc[e * 3 + 2] += LZ[2] * c; } }
      }
    }
    for (let e = 0; e < 6; e++) { out[e][j] = acc[e * 3]; out[e][j + 1] = acc[e * 3 + 1]; out[e][j + 2] = acc[e * 3 + 2]; out[e][j + 3] = a; }
    /* [frente E2] na 1ª passada: quais das 6 vizinhas (±x ±y ±z) esta sonda ENXERGA (raio até ela sem bater em nada) —
       o filtro de ruído (filtrarSondas) só mistura sondas ligadas: nunca as dos dois lados de uma parede */
    if (liga) {
      let b = 0;
      for (let e = 0; e < 6; e++) {
        sh.origin.set(px, py, pz); sh.direction.set(EIXOS[e][0], EIXOS[e][1], EIXOS[e][2]);
        if (!this.bvh.raycastFirst(sh, THREE.DoubleSide, 0, P)) b |= 1 << e;
      }
      liga[k - k0] = b;
    }
  }
  if (liga) out.liga = liga;
  return out;
};

/* [frente E2] O RUÍDO DAS SONDAS (21/10/2026, manchas esverdeadas no alto do estar da Casa 487, sem a luz assada): cada
   sonda tem só 128 raios girados AO ACASO por sonda; a parede alta do estar enxerga o jardim vertical ao sol por um
   ângulo pequeno — uma sonda pega 3 raios nele, a do lado nenhum, e a interpolação vira mancha verde de ~0,5 m. A cor é
   legítima (a luz assada e a foto física mostram o mesmo verde, liso); o que sobra é variância. Filtro 1-2-1 em x, y e z
   (≈ 3×3×3, desvio ÷ 4), só entre sondas VÁLIDAS e LIGADAS (raio de uma até a outra livre): a sonda do outro lado da
   parede nunca entra (o vazamento que o cabeçalho proíbe). faces = 6 × Float32Array(N·4); liga = Uint8Array(N), bit e =
   enxerga a vizinha na direção EIXOS[e]. Muda faces no lugar; o alfa (−1 = inválida, ≥ 0 = céu visível) fica como está. */
export function filtrarSondas(faces, n, liga) {
  const [nx, ny, nz] = n, N = nx * ny * nz, passo = [1, nx, nx * ny], tmp = new Float32Array(N * 3);
  const dentro = (i, eixo, s) => { const c = eixo === 0 ? i % nx : (eixo === 1 ? Math.floor(i / nx) % ny : Math.floor(i / (nx * ny))); const lim = eixo === 0 ? nx : (eixo === 1 ? ny : nz); return c + s >= 0 && c + s < lim; };
  for (let f = 0; f < 6; f++) {
    const F = faces[f];
    for (let eixo = 0; eixo < 3; eixo++) {
      const bp = 1 << (eixo * 2), bm = 1 << (eixo * 2 + 1), d = passo[eixo];
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        if (F[i * 4 + 3] < 0) { tmp[o] = F[i * 4]; tmp[o + 1] = F[i * 4 + 1]; tmp[o + 2] = F[i * 4 + 2]; continue; }
        let r = 2 * F[i * 4], g = 2 * F[i * 4 + 1], b = 2 * F[i * 4 + 2], w = 2;
        const L = liga ? liga[i] : 63;
        if ((L & bp) && dentro(i, eixo, 1)) { const q = (i + d) * 4; if (F[q + 3] >= 0) { r += F[q]; g += F[q + 1]; b += F[q + 2]; w++; } }
        if ((L & bm) && dentro(i, eixo, -1)) { const q = (i - d) * 4; if (F[q + 3] >= 0) { r += F[q]; g += F[q + 1]; b += F[q + 2]; w++; } }
        tmp[o] = r / w; tmp[o + 1] = g / w; tmp[o + 2] = b / w;
      }
      for (let i = 0; i < N; i++) { F[i * 4] = tmp[i * 3]; F[i * 4 + 1] = tmp[i * 3 + 1]; F[i * 4 + 2] = tmp[i * 3 + 2]; }
    }
  }
  return faces;
}

/* o arquivo como WORKER: init → prev (a passada anterior, uma vez por passada) → { faixa, k0, k1 } → { faces } */
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  let nuc = null;
  self.onmessage = (ev) => {
    const m = ev.data;
    try {
      if (m.cmd === 'init') { nuc = new Nucleo(m); self.postMessage({ cmd: 'pronto' }); }
      else if (m.cmd === 'prev') { nuc.prev = m.prev; }
      else if (m.cmd === 'passada') { nuc.ultima = !!m.ultima; }   /* [frente I] */
      else if (m.cmd === 'faixa') { const f = nuc.faixa(m.k0, m.k1), lg = f.liga || null, g = f.grupos || null; self.postMessage({ cmd: 'faixa', id: m.id, k0: m.k0, faces: f, liga: lg, grupos: g }, f.map((x) => x.buffer).concat(lg ? [lg.buffer] : [], g ? [g.buffer] : [])); }
    } catch (e) { self.postMessage({ cmd: 'erro', id: m.id, erro: String(e && e.stack || e) }); }
  };
}

/* =====================================================================
 * O CÁLCULO (thread da tela). opcoes = { scene, sol:{direcao,lux,cor}, ceu:{largura,altura,dados},
 *   passo (m, 0,5), raios (128), passadas (2), maxSondas (40000), trabalhadores (metade dos núcleos),
 *   aoProgresso(f), cancelado() }
 * devolve { origem, n:[nx,ny,nz], passo, faces:[6 × Float32Array(N·4)] (rgb = lux, a = céu visível ou −1), ms, sondas, validas }
 * ===================================================================== */
export async function calcular(op) {
  const t0 = performance.now();
  const { pos, albedo, caixa } = geometriaDaCena(op.scene);
  if (caixa.isEmpty() || !pos.length) return null;
  caixa.expandByScalar(0.6);
  const tam = caixa.getSize(new THREE.Vector3());
  let passo = op.passo || 0.5;
  const maxS = op.maxSondas || 40000;
  while (Math.ceil(tam.x / passo + 1) * Math.ceil(tam.y / passo + 1) * Math.ceil(tam.z / passo + 1) > maxS) passo *= 1.15;
  const n = [Math.ceil(tam.x / passo) + 1, Math.ceil(tam.y / passo) + 1, Math.ceil(tam.z / passo) + 1], N = n[0] * n[1] * n[2];
  const grade = { origem: caixa.min.toArray(), n, passo };
  const raios = op.raios || 128, passadas = Math.max(1, op.passadas || 2);
  const ceu = reduzirCeu(op.ceu, 4);
  const luzes = luzesParaPlaca(op.luzes);   /* [frente E] só vem quando o tempo real NÃO desenha as luminárias */
  /* [frente I] op.grupos: o grupo (comando) de cada luminária ATIVA, na ordem do luzesParaPlaca (o mesmo filtro) */
  const grp = op.grupos && luzes.n ? Int32Array.from((op.luzes || []).filter((l) => l && l.ligada !== false && +l.intensidade > 0 && Array.isArray(l.posicao)).map((l) => l.grupo | 0)) : null;
  const nG = grp ? Math.max(0, ...grp) + 1 : 0;
  /* METADE DOS NÚCLEOS (o PC é do Rogério também — CLAUDE.md §6.11) */
  const W = Math.max(1, Math.min(8, op.trabalhadores || Math.floor((navigator.hardwareConcurrency || 4) / 2)));
  const url = new URL(import.meta.url);
  const ws = [];
  try {
    for (let i = 0; i < W; i++) ws.push(new Worker(url, { type: 'module' }));
    await Promise.all(ws.map((w) => new Promise((res, rej) => {
      w.onmessage = (e) => { if (e.data.cmd === 'pronto') res(); else if (e.data.cmd === 'erro') rej(new Error(e.data.erro)); };
      w.onerror = (e) => rej(new Error(e.message || 'worker'));
      w.postMessage({ cmd: 'init', pos, albedo, grade, ceu, sol: op.sol || null, raios, luzes: luzes.n ? luzes : null, grupos: grp, nGrupos: nG });
    })));
    let prev = null, dadosG = null;
    const liga = new Uint8Array(N);
    const FAIXA = Math.max(256, Math.ceil(N / (W * 12)));
    for (let pa = 0; pa < passadas; pa++) {
      const faces = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(N * 4));
      if (prev) ws.forEach((w) => w.postMessage({ cmd: 'prev', prev }));   /* a grade anterior vai UMA vez por passada, não em cada faixa */
      if (grp) { ws.forEach((w) => w.postMessage({ cmd: 'passada', ultima: pa === passadas - 1 })); if (pa === passadas - 1) dadosG = new Float32Array(N * nG * 18); }   /* [frente I] */
      const fila = []; for (let k = 0; k < N; k += FAIXA) fila.push([k, Math.min(N, k + FAIXA)]);
      let feitas = 0; const total = fila.length;
      await Promise.all(ws.map((w) => new Promise((res, rej) => {
        const prox = () => {
          if (op.cancelado && op.cancelado()) { res(); return; }
          const f = fila.shift(); if (!f) { res(); return; }
          w.onmessage = (e) => {
            const m = e.data; if (m.cmd === 'erro') { rej(new Error(m.erro)); return; }
            m.faces.forEach((arr, ei) => faces[ei].set(arr, m.k0 * 4));
            if (m.liga) liga.set(m.liga, m.k0);
            if (m.grupos && dadosG) dadosG.set(m.grupos, m.k0 * nG * 18);   /* [frente I] */
            feitas++; if (op.aoProgresso) { try { op.aoProgresso((pa + feitas / total) / passadas); } catch (x) { /* a tela não derruba o cálculo */ } }
            prox();
          };
          w.postMessage({ cmd: 'faixa', k0: f[0], k1: f[1] });
        };
        prox();
      })));
      if (op.cancelado && op.cancelado()) return null;
      if (op.filtro !== false) filtrarSondas(faces, n, liga);   /* [frente E2] o ruído de 128 raios por sonda (ver filtrarSondas) */
      prev = faces;
    }
    let nv = 0; for (let k = 0; k < N; k++) if (prev[0][k * 4 + 3] >= 0) nv++;
    return { origem: grade.origem, n, passo, faces: prev, sondas: N, validas: nv, ms: Math.round(performance.now() - t0), raios, passadas, trabalhadores: W, luminarias: luzes.n,
      grupos: dadosG ? { n: nG, dados: dadosG } : null };   /* [frente I] */
  } finally { ws.forEach((w) => { try { w.terminate(); } catch (e) { /* já encerrado */ } }); }
}

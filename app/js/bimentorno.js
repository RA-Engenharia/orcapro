/* =====================================================================
 * bimentorno.js — O ENTORNO do render ao vivo (frente F, 20/10/2026)
 *
 * O que mais separa uma cena de arquitetura de uma foto é o que está em volta
 * da casa: grama de verdade perto da câmera, árvores e arbustos balançando.
 *
 *   GRAMA   lâminas instanciadas (geometria e vento 100 % em TSL, sem asset): uma grade em volta da
 *           câmera, presa ao mundo (a lâmina não anda junto com a câmera — só as que saem do raio
 *           são reaproveitadas na borda), com fade pela distância. Só nasce onde a SUPERFÍCIE MAIS
 *           ALTA do ponto é de material `grama` (o chão automático ao redor e a grama do modelo): a
 *           laje, o piso, a água e o telhado cobrem a grama, e ela nunca atravessa a casa.
 *   ÁRVORES EZ-Tree (MIT, bim/vendor/jsm/ez-tree): só a geometria; material, folha (desenhada aqui,
 *           sem arquivo), casca (Poly Haven CC0) e VENTO são nossos, em TSL — o GLSL do pacote não
 *           roda no WebGPU. InstancedMesh por espécie e por nível de detalhe (perto: preset médio;
 *           longe: preset pequeno, a malha com 1/3 dos triângulos).
 *   POSIÇÃO fora da caixa da casa, em volta, só em grama, semente FIXA (a mesma obra dá sempre o
 *           mesmo entorno). As plantas que já vêm no modelo (`folhagem`) não são tocadas nem cobertas.
 *   LUZ     entram na sombra do sol (as árvores PROJETAM, a grama RECEBE) e na luz do céu; NÃO entram
 *           no cálculo da luz assada nem das sondas (o motor passa uma cena sem elas: userData.entorno).
 *
 * ⚠ A foto física (path tracer) não conhece o entorno: com ele ligado a UI não a mostra por cima.
 * ES module; mesmo three r186 (WebGPU) do js/bimrendervivo.js, que o importa só ao montar a cena.
 * ===================================================================== */
import * as CORE from '../bim/vendor/jsm/pathtracer/three/three.core.js';
import * as GPU from '../bim/vendor/jsm/pathtracer/three/three.webgpu.js';
import {
  Fn, uniform, float, vec2, vec3, vec4, uint, instanceIndex, floor, fract, sin, cos, mix, smoothstep, clamp, step, max, min, length,
  normalize, hash, varying, texture, positionGeometry, positionLocal, positionWorld, attribute, transformNormalToView, uv,
  mx_fractal_noise_float
} from '../bim/vendor/jsm/pathtracer/three/three.tsl.js';
import { Tree } from '../bim/vendor/jsm/ez-tree/tree.js';
import { loadPreset } from '../bim/vendor/jsm/ez-tree/presets.js';

const THREE = Object.assign({}, CORE, GPU);
const NEG = -1e4;   /* "não tem grama aqui" no mapa de alturas */

/* ---------------------------------------------------------------------
 * PARTE PURA (testada em node, tools/test-bimentorno.js): região, mapa de alturas, posições
 * --------------------------------------------------------------------- */
export function mulberry32(a) {
  let t = a >>> 0;
  return function () { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
/* a semente vem da caixa da casa (arredondada a 10 cm): a mesma obra, o mesmo entorno */
export function sementeDe(casa) {
  const q = [casa.minx, casa.maxx, casa.minz, casa.maxz].map((v) => Math.round(v * 10));
  let h = 2166136261;
  q.forEach((v) => { h ^= (v | 0); h = Math.imul(h, 16777619) >>> 0; });
  return h >>> 0;
}
/* a caixa da CASA em planta (xz): os grupos da cena SEM o chão (grama/terra/água/folhagem) e sem plano achatado grande
   (o chão automático de um sobrado pequeno tem 80 m e entraria na caixa que o motor chama de "casa") */
export function caixaDaCasa(grupos, materiais) {
  const com = caixaDe(grupos, materiais, false), sem = caixaDe(grupos, materiais, true);
  /* a topografia de um IFC vem num material qualquer e com declive (passa de 0,6 m): se tirar o(s) grupo(s) grande(s) e quase plano(s)
     encolhe a caixa a menos da metade, era o terreno (quiosque de ensaio: a "casa" tinha 57 × 35 m e as árvores nunca achavam lugar) */
  if (com && sem && (sem.maxx - sem.minx) * (sem.maxz - sem.minz) < 0.5 * (com.maxx - com.minx) * (com.maxz - com.minz)) return sem;
  return com;
}
function caixaDe(grupos, materiais, semTopografia) {
  const c = { minx: Infinity, maxx: -Infinity, minz: Infinity, maxz: -Infinity }, fora = { grama: 1, terra: 1, agua: 1, folhagem: 1 };
  (grupos || []).forEach((g) => {
    if (semTopografia && chaoLargo(g)) return;
    const mt = materiais && materiais[g.mat]; if (mt && fora[mt.id]) return;
    const p = g.pos; if (!p || !p.length) return;
    let a = Infinity, b = -Infinity, c0 = Infinity, d = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1], z = p[i + 2]; if (x < a) a = x; if (x > b) b = x; if (z < c0) c0 = z; if (z > d) d = z; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (y1 - y0 < 0.6 && Math.max(b - a, d - c0) > 30) return;   /* plano achatado e grande = chão/terreno */
    c.minx = Math.min(c.minx, a); c.maxx = Math.max(c.maxx, b); c.minz = Math.min(c.minz, c0); c.maxz = Math.max(c.maxz, d);
  });
  return isFinite(c.minx) ? c : null;
}
/* a região quadrada do mapa: a casa + `margem` m para cada lado, N × N células (a célula não passa de 35 cm) */
export function regiaoDe(casa, margem, N) {
  const n = N || 1024, cx = (casa.minx + casa.maxx) / 2, cz = (casa.minz + casa.maxz) / 2;
  const meio = Math.max(casa.maxx - casa.minx, casa.maxz - casa.minz) / 2 + (margem == null ? 45 : margem);
  const cell = Math.min(0.35, Math.max(0.12, 2 * meio / n)), lado = cell * n;
  return { x0: cx - lado / 2, z0: cz - lado / 2, n: n, cell: cell, lado: lado };
}
/* MAPA DE ALTURAS DE CIMA: para cada célula, a altura da superfície VOLTADA PARA CIMA mais alta e se ela é de
   material `grama`. Roda sobre os mesmos grupos (pos/nor/idx/mat) que o motor desenha. Também marca `veg`: onde há
   planta do próprio modelo (material `folhagem`) — ali o entorno não planta. */
/* idsGrama: lista de ids de material que valem como grama (padrão ['grama']) ou 'chao-largo' = o(s) grupo(s) grande(s) e quase plano(s)
   do modelo (a topografia do IFC, seja qual for o material que ela recebeu) */
function chaoLargo(g) {
  const p = g.pos; if (!p || !p.length) return false;
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1], z = p[i + 2]; if (x < a) a = x; if (x > b) b = x; if (z < c) c = z; if (z > d) d = z; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const ext = Math.max(b - a, d - c); return ext > 40 && (y1 - y0) / ext < 0.25;
}
/* quais grupos o modo de grama escolheu como chão (para tingir de verde o que o IFC entregou como terra/topografia) */
export function gruposDeChao(grupos, materiais, idsGrama) {
  const r = [];
  (grupos || []).forEach((g, i) => {
    const mt = materiais && materiais[g.mat], id = mt && mt.id;
    if (idsGrama === 'chao-largo' ? chaoLargo(g) : (idsGrama || ['grama']).indexOf(id) >= 0) r.push(i);
  });
  return r;
}
export function rasterizar(grupos, materiais, reg, idsGrama) {
  const n = reg.n, alt = new Float32Array(n * n).fill(NEG), grama = new Uint8Array(n * n), veg = new Uint8Array(n * n), inv = 1 / reg.cell;
  const marcar = (k, y, eG) => {
    if (y > alt[k] + 0.003) { alt[k] = y; grama[k] = eG ? 1 : 0; } else if (y >= alt[k] - 0.003 && !eG) grama[k] = 0;
  };
  (grupos || []).forEach((g) => {
    const mt = materiais && materiais[g.mat], id = mt && mt.id, eG = idsGrama === 'chao-largo' ? chaoLargo(g) : (idsGrama || ['grama']).indexOf(id) >= 0, eV = id === 'folhagem';
    const p = g.pos, no = g.nor, ix = g.idx, nt = Math.floor((ix ? ix.length : p.length / 3) / 3);
    for (let t = 0; t < nt; t++) {
      const ia = ix ? ix[t * 3] : t * 3, ib = ix ? ix[t * 3 + 1] : t * 3 + 1, ic = ix ? ix[t * 3 + 2] : t * 3 + 2;
      const ua = (p[ia * 3] - reg.x0) * inv, va = (p[ia * 3 + 2] - reg.z0) * inv, ub = (p[ib * 3] - reg.x0) * inv, vb = (p[ib * 3 + 2] - reg.z0) * inv, uc = (p[ic * 3] - reg.x0) * inv, vc = (p[ic * 3 + 2] - reg.z0) * inv;
      const umin = Math.min(ua, ub, uc), umax = Math.max(ua, ub, uc), vmin = Math.min(va, vb, vc), vmax = Math.max(va, vb, vc);
      if (umax < 0 || vmax < 0 || umin >= n || vmin >= n) continue;
      const i0 = Math.max(0, Math.floor(umin)), i1 = Math.min(n - 1, Math.floor(umax)), j0 = Math.max(0, Math.floor(vmin)), j1 = Math.min(n - 1, Math.floor(vmax));
      if (eV) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) veg[j * n + i] = 1;
      /* só superfície voltada para cima (a normal do vértice; o enrolamento do IFC nem sempre é confiável) */
      if (no && (no[ia * 3 + 1] + no[ib * 3 + 1] + no[ic * 3 + 1]) < 0.6) {
        /* chão (grama/terra do modelo) com a normal virada para baixo — IFC de topografia costuma vir assim: vale pela geometria */
        if (!eG) continue;
        const ux = p[ib * 3] - p[ia * 3], uz = p[ib * 3 + 2] - p[ia * 3 + 2], vx = p[ic * 3] - p[ia * 3], vz = p[ic * 3 + 2] - p[ia * 3 + 2], uy = p[ib * 3 + 1] - p[ia * 3 + 1], vy = p[ic * 3 + 1] - p[ia * 3 + 1];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz);
        if (!(nl > 1e-12) || Math.abs(ny) / nl < 0.4) continue;
      }
      const ay = p[ia * 3 + 1], by = p[ib * 3 + 1], cy = p[ic * 3 + 1];
      const den = (vb - vc) * (ua - uc) + (uc - ub) * (va - vc);
      let acertos = 0;
      if (Math.abs(den) > 1e-12) {
        for (let j = j0; j <= j1; j++) {
          const py = j + 0.5;
          for (let i = i0; i <= i1; i++) {
            const px = i + 0.5, w1 = ((vb - vc) * (px - uc) + (uc - ub) * (py - vc)) / den, w2 = ((vc - va) * (px - uc) + (ua - uc) * (py - vc)) / den, w3 = 1 - w1 - w2;
            if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
            acertos++; marcar(j * n + i, w1 * ay + w2 * by + w3 * cy, eG);
          }
        }
      }
      /* triângulo menor que uma célula: o centro dele ainda conta */
      if (!acertos) {
        const ci = Math.floor((ua + ub + uc) / 3), cj = Math.floor((va + vb + vc) / 3);
        if (ci >= 0 && cj >= 0 && ci < n && cj < n) marcar(cj * n + ci, (ay + by + cy) / 3, eG);
      }
    }
  });
  return { alt, grama, veg };
}
/* altura da grama num ponto (NEG se ali a superfície de cima não é grama ou está fora da região) */
export function alturaGrama(mapa, reg, x, z) {
  const i = Math.floor((x - reg.x0) / reg.cell), j = Math.floor((z - reg.z0) / reg.cell);
  if (i < 0 || j < 0 || i >= reg.n || j >= reg.n) return NEG;
  const k = j * reg.n + i; return mapa.grama[k] ? mapa.alt[k] : NEG;
}
/* DENSIDADE PELA DISTÂNCIA AO PISO (frente P): a grama NUNCA nasce sobre calçada, piso, pavimento ou laje — e também não encosta neles.
   Para cada célula de grama, a distância (m) até a célula mais próxima que NÃO é grama (superfície de cima de outro material, ou nada),
   por transformada de distância em duas passadas (pesos 1 e √2); a densidade sobe de 0 (colado no piso) a 1 (a `m1` metros dele) com
   curva suave: as lâminas encolhem e rareiam perto da borda em vez de parar num corte reto (e a ponta da lâmina, que pende uns 3 cm,
   não passa por cima do piso). Uint8 0..255. A distância é medida do CENTRO da célula até a BORDA da célula de piso (−meia célula). */
export const BORDA_GRAMA = { m0: 0.16, m1: 0.65 };
export function densidadeDeBorda(mapa, reg, m0, m1) {
  const n = reg.n, g = mapa.grama, INF = 1e9, d = new Float32Array(n * n), a = m0 == null ? BORDA_GRAMA.m0 : m0, b = m1 == null ? BORDA_GRAMA.m1 : m1, D = 1.4142136;
  for (let k = 0; k < d.length; k++) d[k] = g[k] ? INF : 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; let v = d[k]; if (v === 0) continue;
    if (i > 0 && d[k - 1] + 1 < v) v = d[k - 1] + 1;
    if (j > 0) { if (d[k - n] + 1 < v) v = d[k - n] + 1; if (i > 0 && d[k - n - 1] + D < v) v = d[k - n - 1] + D; if (i < n - 1 && d[k - n + 1] + D < v) v = d[k - n + 1] + D; }
    d[k] = v;
  }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
    const k = j * n + i; let v = d[k]; if (v === 0) continue;
    if (i < n - 1 && d[k + 1] + 1 < v) v = d[k + 1] + 1;
    if (j < n - 1) { if (d[k + n] + 1 < v) v = d[k + n] + 1; if (i < n - 1 && d[k + n + 1] + D < v) v = d[k + n + 1] + D; if (i > 0 && d[k + n - 1] + D < v) v = d[k + n - 1] + D; }
    d[k] = v;
  }
  const out = new Uint8Array(n * n);
  for (let k = 0; k < out.length; k++) {
    if (!g[k]) continue;
    const m = (d[k] - 0.5) * reg.cell, t = Math.min(1, Math.max(0, (m - a) / (b - a)));
    out[k] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  return out;
}
/* RUÍDO TILEÁVEL em 4 escalas (RGBA, N × N): soma de ondas planas de frequência INTEIRA (por isso emenda nas bordas), uma faixa de
   frequências por canal — R: manchas de 5 a 16 m (palha, viço), G: 1,6 a 5 m, B: 0,8 a 2 m (touceiras), A: 0,4 a 0,8 m (falhas),
   para um período de 16 m. Determinístico (semente fixa). Valores 0..255, centrados em 128. */
export const PERIODO_RUIDO = 16;
export function ruidoTileavel(N, semente) {
  const rnd = mulberry32(semente == null ? 20261021 : semente), faixas = [[1, 3], [3, 10], [8, 20], [20, 40]], px = new Uint8Array(N * N * 4), ondas = [];
  faixas.forEach((fx) => {
    const w = [];
    for (let q = 0; q < 6; q++) {
      let kx = 0, ky = 0;
      for (let tent = 0; tent < 50; tent++) { kx = Math.round((rnd() * 2 - 1) * fx[1]); ky = Math.round((rnd() * 2 - 1) * fx[1]); const k = Math.hypot(kx, ky); if (k >= fx[0] && k <= fx[1]) break; }
      w.push([kx, ky, rnd() * Math.PI * 2]);
    }
    ondas.push(w);
  });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    for (let c = 0; c < 4; c++) {
      let v = 0; const w = ondas[c];
      for (let q = 0; q < w.length; q++) v += Math.cos(2 * Math.PI * (w[q][0] * x + w[q][1] * y) / N + w[q][2]);
      px[(y * N + x) * 4 + c] = Math.max(0, Math.min(255, Math.round(128 + v * 22)));
    }
  }
  return px;
}
/* POSIÇÕES: fora da caixa da casa, em volta, só em grama; a semente fixa dá sempre o mesmo resultado.
   op = { reg, mapa, casa:{minx,maxx,minz,maxz}, semente, especies:[{id,tipo,alt:[min,max],copaK,peso}], nArv, nArb, evitar:[{x,z,r}] } */
export function plantar(op) {
  const rnd = mulberry32(op.semente), reg = op.reg, casa = op.casa, out = [];
  const distCasa = (x, z) => { const dx = Math.max(casa.minx - x, 0, x - casa.maxx), dz = Math.max(casa.minz - z, 0, z - casa.maxz); return Math.hypot(dx, dz); };
  const escolher = (tipo) => {
    const L = op.especies.filter((e) => e.tipo === tipo), tot = L.reduce((s, e) => s + (e.peso || 1), 0); let r = rnd() * tot;
    for (const e of L) { r -= e.peso || 1; if (r <= 0) return e; } return L[L.length - 1];
  };
  const livre = (x, z, r) => {
    /* o pé e a copa em volta: grama embaixo, nenhuma planta do modelo, dentro da região */
    if (x < reg.x0 + 1 || z < reg.z0 + 1 || x > reg.x0 + reg.lado - 1 || z > reg.z0 + reg.lado - 1) return false;
    const pe = Math.min(0.9, r * 0.35);
    for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4; if (alturaGrama(op.mapa, reg, x + Math.cos(an) * pe, z + Math.sin(an) * pe) <= NEG / 2) return false; }
    if (alturaGrama(op.mapa, reg, x, z) <= NEG / 2) return false;
    for (let a = 0; a < 8; a++) {
      const an = a * Math.PI / 4, i = Math.floor((x + Math.cos(an) * (r + 0.5) - reg.x0) / reg.cell), j = Math.floor((z + Math.sin(an) * (r + 0.5) - reg.z0) / reg.cell);
      if (i >= 0 && j >= 0 && i < reg.n && j < reg.n && op.mapa.veg[j * reg.n + i]) return false;
    }
    return !(op.evitar || []).some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r);
  };
  [['arvore', op.nArv, 6.0, 44], ['arbusto', op.nArb, 2.0, 30]].forEach(([tipo, quanto, dmin, dmax]) => {
    let feitos = 0;
    /* 2ª passada (só se a 1ª não encheu): lote apertado — a faixa de grama em volta da casa é estreita: vale mais perto que o mínimo e mais longe que o máximo; a copa continua fora da parede */
    for (let tent = 0; tent < 18000 && feitos < quanto; tent++) {
      const e = escolher(tipo); if (!e) break;
      const apertado = tent >= 9000;
      const h = e.alt[0] + (e.alt[1] - e.alt[0]) * rnd(), r = h * e.copaK;
      const x = reg.x0 + rnd() * reg.lado, z = reg.z0 + rnd() * reg.lado, d = distCasa(x, z);
      /* o miolo do pedido é "fora da casa": a copa inteira fica além da parede (mais 0,8 m), nunca por cima do telhado */
      if (d < (apertado ? r + 0.8 : Math.max(dmin, r + 0.8)) || d > (apertado ? dmax * 1.8 : dmax)) { if (op.diag) op.diag.distancia = (op.diag.distancia || 0) + 1; continue; }
      if (!livre(x, z, r)) { if (op.diag) op.diag.ocupado = (op.diag.ocupado || 0) + 1; continue; }
      if (out.some((q) => Math.hypot(q.x - x, q.z - z) < (q.r + r) * (tipo === 'arvore' ? 0.8 : 0.55))) continue;
      out.push({ x: x, y: alturaGrama(op.mapa, reg, x, z), z: z, sp: e.id, tipo: tipo, h: h, r: r, yaw: rnd() * Math.PI * 2, esc: 0.92 + 0.16 * rnd() });
      feitos++;
    }
  });
  return out;
}

/* ---------------------------------------------------------------------
 * AS ESPÉCIES (presets do EZ-Tree escalados para metros) e a QUALIDADE
 * --------------------------------------------------------------------- */
const ESPECIES = [
  { id: 'carvalho', kFolha: 1.7, tipo: 'arvore', perto: 'Oak Medium', longe: 'Oak Small', alt: [7.5, 10.5], folha: 'larga', tinta: [0.80, 0.92, 0.66], casca: 0xd2c6ad, peso: 1.5 },
  { id: 'freixo', kFolha: 1.5, tipo: 'arvore', perto: 'Ash Medium', longe: 'Ash Small', alt: [8.5, 12.0], folha: 'fina', tinta: [0.86, 0.96, 0.70], casca: 0xc9c3b2, peso: 3 },
  { id: 'choupo', kFolha: 1.6, tipo: 'arvore', perto: 'Aspen Medium', longe: null, alt: [6.5, 9.0], folha: 'larga', tinta: [1.00, 0.98, 0.58], casca: 0xe4dfd2, peso: 1 },
  { id: 'palmeira', tipo: 'arvore', perto: null, geometria: 'palmeira', longe: null, alt: [5.0, 7.5], folha: 'palma', tinta: [0.80, 0.96, 0.62], casca: 0xa39a85, peso: 1.5, centroK: 0.95, raioK: 0.3 },
  { id: 'arbusto1', kFolha: 1.5, tipo: 'arbusto', perto: 'Bush 1', longe: null, alt: [1.0, 1.7], folha: 'arbusto', tinta: [0.70, 0.88, 0.58], casca: 0xb9ad94, peso: 2 },
  { id: 'arbusto2', kFolha: 1.5, tipo: 'arbusto', perto: 'Bush 2', longe: null, alt: [0.9, 1.5], folha: 'arbusto', tinta: [0.78, 0.92, 0.55], casca: 0xb9ad94, peso: 2 }
];
const QUAL_ENT = {
  /* grama (frente P): perto, lâmina fina de 5 vértices e rala nos primeiros metros; de longe, triângulo só. Alturas de gramado aparado (3 a 9 cm). */
  leve:  { arvores: 5,  arbustos: 8, sombras: 2, grama: [{ R: 10, s: 0.13, h: 0.055, w: 0.009, forma: 3, ralo: [0.5, 0.6, 3.5] }] },
  alta:  { arvores: 9, arbustos: 18, sombras: 3, grama: [{ R: 5, s: 0.08, h: 0.05, w: 0.0065, forma: 5, ralo: [0.5, 0.6, 3.5] }, { R: 15, s: 0.13, h: 0.07, w: 0.010, forma: 3, ralo: [0.5, 1, 5] }] },
  ultra: { arvores: 12, arbustos: 24, sombras: 5, grama: [{ R: 6, s: 0.056, h: 0.06, w: 0.0072, forma: 5, ralo: [0.5, 0.6, 3.5] }, { R: 18, s: 0.105, h: 0.08, w: 0.010, forma: 3, ralo: [0.5, 1, 5] }] }
};
const DIST_LOD0 = 75, DIST_LOD1 = 260;   /* m: até aqui o preset médio; depois o pequeno; além disso some */

/* A PALMEIRA: o EZ-Tree não faz palmeira, então o tronco (curvo, afinando) e a coroa de folhas arqueadas são gerados aqui.
   Devolve { gR: tronco, gF: folhas, H, copa, tri } na mesma forma do preset do EZ-Tree (base em y = 0, 7 m de altura). */
export function gerarPalmeira(rnd) {
  const H = 7, nS = 14, nG = 8, pos = [], uvs = [], idx = [], fp = [], fuv = [], fidx = [];
  const curvaX = (rnd() - 0.5) * 0.9, curvaZ = (rnd() - 0.5) * 0.9, dxy = (s) => [curvaX * s * s, curvaZ * s * s];
  for (let i = 0; i <= nS; i++) {
    const s = i / nS, r = (0.17 - 0.06 * s) * (1 + 0.5 * Math.exp(-s * 18)), c = dxy(s);
    for (let j = 0; j <= nG; j++) { const a = j / nG * Math.PI * 2; pos.push(c[0] + Math.cos(a) * r, s * H, c[1] + Math.sin(a) * r); uvs.push(j / nG, s * H * 0.6); }
  }
  for (let i = 0; i < nS; i++) for (let j = 0; j < nG; j++) { const a = i * (nG + 1) + j, b = a + nG + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const gR = new THREE.BufferGeometry(); gR.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gR.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); gR.setIndex(idx); gR.computeVertexNormals();
  /* a coroa: folhas em leque, as de cima quase em pé e as de baixo caindo */
  const top = dxy(1), nF = 18, nP = 9;
  for (let f = 0; f < nF; f++) {
    const phi = f / nF * Math.PI * 2 + (rnd() - 0.5) * 0.35, up = f % 3 === 0 ? 1 : 0, th0 = (up ? 0.25 : 0.75 + rnd() * 0.55), curva = 1.0 + rnd() * 0.7, L = (up ? 2.0 : 2.7) * (0.85 + 0.3 * rnd());
    const dir = [Math.cos(phi), Math.sin(phi)], lado = [-Math.sin(phi), Math.cos(phi)], base0 = fp.length / 3;
    let x = top[0], y = H - 0.15, z = top[1];
    for (let k = 0; k <= nP; k++) {
      const s = k / nP, th = th0 + curva * s, wd = 0.95 * Math.sin(Math.PI * Math.min(1, 0.2 + s * 0.85)) * (1 - s * 0.55);
      [-1, 1].forEach((sg, q) => { fp.push(x + lado[0] * sg * wd, y - Math.abs(sg) * wd * 0.25, z + lado[1] * sg * wd); fuv.push(q, s); });
      const ds = L / nP; x += dir[0] * Math.sin(th) * ds; z += dir[1] * Math.sin(th) * ds; y += Math.cos(th) * ds;
    }
    for (let k = 0; k < nP; k++) { const a = base0 + k * 2; fidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const gF = new THREE.BufferGeometry(); gF.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); gF.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2)); gF.setIndex(fidx); gF.computeVertexNormals();
  return { gR: gR, gF: gF, H: H + 1.2, copa: 2.6, tri: (idx.length + fidx.length) / 3 };
}

/* ---------------------------------------------------------------------
 * A FOLHA: desenhada em código (cartão de ramo com folhas, base no centro de baixo). Sem arquivo = sem licença de
 * terceiro. O RGB do que é transparente recebe a cor média (senão o mipmap escurece a borda).
 * --------------------------------------------------------------------- */
function texturaFolha(tipo, rnd) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const folha = (x, y, ang, len, wid, h, s, l) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    const gr = g.createLinearGradient(0, 0, 0, -len);
    gr.addColorStop(0, 'hsl(' + h + ',' + s + '%,' + (l * 0.82) + '%)'); gr.addColorStop(1, 'hsl(' + (h + 6) + ',' + (s + 4) + '%,' + (l * 1.3) + '%)');
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(wid, -len * 0.22, wid * 0.8, -len * 0.74, 0, -len); g.bezierCurveTo(-wid * 0.8, -len * 0.74, -wid, -len * 0.22, 0, 0);
    g.fillStyle = gr; g.fill(); g.lineWidth = 1; g.strokeStyle = 'hsla(' + h + ',' + s + '%,' + (l * 0.45) + '%,0.55)'; g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.92); g.strokeStyle = 'hsla(' + h + ',' + (s - 10) + '%,' + (l * 1.45) + '%,0.5)'; g.lineWidth = 1.2; g.stroke();
    g.restore();
  };
  const R = (a, b) => a + (b - a) * rnd();
  g.strokeStyle = 'hsl(80,25%,22%)'; g.lineWidth = 2.5;
  if (tipo === 'palma') {
    /* folha de palmeira: nervura central e folíolos finos e longos dos dois lados, encurtando para a ponta */
    g.beginPath(); g.moveTo(S / 2, S - 2); g.quadraticCurveTo(S / 2 + 3, S / 2, S / 2, 6); g.lineWidth = 3; g.strokeStyle = 'hsl(78,30%,26%)'; g.stroke();
    for (let k = 0; k < 34; k++) {
      const f = k / 34, y = S - 8 - f * (S - 18), ln = 104 * Math.sin(Math.PI * (0.18 + 0.82 * (1 - f) * 0.9)) * (0.55 + 0.45 * (1 - f)) + 10, aa = 0.95 - f * 0.25;
      folha(S / 2, y, -aa + R(-0.05, 0.05), ln, 4.2, R(92, 104), R(46, 56), R(28, 36));
      folha(S / 2, y, aa + R(-0.05, 0.05), ln, 4.2, R(92, 104), R(46, 56), R(28, 36));
    }
  } else if (tipo === 'fina') {
    /* folha composta (freixo): eixo central com pares de folíolos alongados */
    g.beginPath(); g.moveTo(S / 2, S - 4); g.lineTo(S / 2, 18); g.stroke();
    for (let k = 0; k < 8; k++) {
      const y = S - 22 - k * 27, ln = 78 - k * 3.5;
      folha(S / 2, y, -1.15 + R(-0.08, 0.08), ln, 15, R(88, 104), R(42, 52), R(30, 38));
      folha(S / 2, y, 1.15 + R(-0.08, 0.08), ln, 15, R(88, 104), R(42, 52), R(30, 38));
    }
    folha(S / 2, 44, 0, 44, 13, 96, 48, 36);
  } else if (tipo === 'arbusto') {
    for (let k = 0; k < 22; k++) { const a = R(-1.45, 1.45), y = S - 6 - R(0, 70); folha(S / 2 + Math.sin(a) * R(0, 70), y, a + R(-0.3, 0.3), R(52, 86), R(20, 30), R(86, 112), R(38, 56), R(24, 36)); }
  } else {
    for (let k = 0; k < 13; k++) { const a = R(-1.35, 1.35); folha(S / 2 + Math.sin(a) * R(0, 56), S - 8 - R(0, 40), a + R(-0.25, 0.25), R(62, 100), R(26, 38), R(84, 110), R(38, 54), R(26, 38)); }
  }
  const im = g.getImageData(0, 0, S, S), d = im.data; let r = 0, gg = 0, b = 0, c = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; c++; }
  r = c ? r / c : 80; gg = c ? gg / c : 110; b = c ? b / c : 40;
  /* a linha 0 do DataTexture é v = 0 = a BASE do cartão (onde a folha se prende): inverte as linhas do canvas */
  const px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = ((S - 1 - y) * S + x) * 4, o = (y * S + x) * 4, a = d[i + 3];
    px[o] = a < 40 ? r : d[i]; px[o + 1] = a < 40 ? gg : d[i + 1]; px[o + 2] = a < 40 ? b : d[i + 2]; px[o + 3] = a;
  }
  const t = new THREE.DataTexture(px, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

/* ---------------------------------------------------------------------
 * O ENTORNO
 * --------------------------------------------------------------------- */
export class Entorno {
  /* opcoes: { qualidade:'leve'|'alta'|'ultra', aniso } */
  constructor(opcoes) {
    this.o = opcoes || {}; this.cfg = QUAL_ENT[this.o.qualidade] || QUAL_ENT.alta;
    this.grupo = new THREE.Group(); this.grupo.name = 'entorno';
    this.uT = uniform(0); this.uCam = uniform(new THREE.Vector3()); this.uVento = uniform(new THREE.Vector2(0.8, 0.6));
    this.recursos = []; this.camadas = []; this.baldes = []; this.arvores = []; this._lodT = -1e9; this._lodPos = null;
    this.ligado = true; this.info = null; this.uLig = uniform(1); this.chaoIdx = [];
  }
  _guardar(r) { this.recursos.push(r); return r; }
  _marcar(m) { m.userData.entorno = true; m.frustumCulled = false; m.layers.set(1); return m; }   /* camada 1: o piso planar não a reflete (js/bimreflexo.js) */

  /* cena: { grupos, materiais } do motor; ctx: { casa:Box3, camera } */
  async montar(cena, ctx) {
    const t0 = performance.now(), c = ctx.casa; this._camera = ctx.camera;   /* [Cena: objetos] */
    const casa = caixaDaCasa(cena.grupos, cena.materiais) || { minx: c.min.x, maxx: c.max.x, minz: c.min.z, maxz: c.max.z };
    const reg = this.reg = regiaoDe(casa, 45, 1024);
    let mapa = rasterizar(cena.grupos, cena.materiais, reg), nGrama = 0, usouTerra = false; this.chaoIdx = [];
    for (let k = 0; k < mapa.grama.length; k++) nGrama += mapa.grama[k];
    /* sem nenhuma grama no modelo (o terreno do IFC vem como `terra`, ex.: quiosque de ensaio): a terra natural vira gramado ralo — o calçamento e a laje continuam cobrindo */
    if (nGrama * reg.cell * reg.cell < 40) { mapa = rasterizar(cena.grupos, cena.materiais, reg, ['grama', 'terra']); nGrama = 0; for (let k = 0; k < mapa.grama.length; k++) nGrama += mapa.grama[k]; usouTerra = nGrama > 0; if (usouTerra) this.chaoIdx = gruposDeChao(cena.grupos, cena.materiais, ['terra']); }
    /* nem terra: a topografia do IFC pode ter vindo com qualquer material — o grupo grande e quase plano vira gramado */
    if (nGrama * reg.cell * reg.cell < 40) { mapa = rasterizar(cena.grupos, cena.materiais, reg, 'chao-largo'); nGrama = 0; for (let k = 0; k < mapa.grama.length; k++) nGrama += mapa.grama[k]; usouTerra = nGrama > 0 ? 'chao-largo' : false; if (usouTerra) this.chaoIdx = gruposDeChao(cena.grupos, cena.materiais, 'chao-largo'); }
    this.mapa = mapa;
    const tRaster = performance.now() - t0;
    const ids = {}; (cena.grupos || []).forEach((g) => { const id = (cena.materiais[g.mat] || {}).id || '?'; ids[id] = (ids[id] || 0) + Math.round((g.idx ? g.idx.length : g.pos.length / 3) / 3); });
    this.info = { ids: ids, regiao: { lado: Math.round(reg.lado), celula: +reg.cell.toFixed(3) }, areaGrama: Math.round(nGrama * reg.cell * reg.cell), msRaster: Math.round(tRaster), terraViraGrama: usouTerra };
    { let i0 = 1e9, i1 = -1, j0 = 1e9, j1 = -1; for (let k = 0; k < mapa.grama.length; k++) if (mapa.grama[k]) { const i = k % reg.n, j = (k / reg.n) | 0; if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
      if (i1 >= 0) this.info.caixaGrama = [reg.x0 + i0 * reg.cell, reg.x0 + (i1 + 1) * reg.cell, reg.z0 + j0 * reg.cell, reg.z0 + (j1 + 1) * reg.cell].map((v) => +v.toFixed(1)); }
    if (nGrama * reg.cell * reg.cell < 40) { this.info.vazio = 'sem grama na cena'; return this.info; }
    /* o mapa vai à placa em meio-float (RG): R = altura onde a superfície de cima é grama, −1000 no resto; G = densidade pela distância
       ao piso/calçada/laje mais próximo (a grama não nasce sobre eles nem encosta neles) */
    const dens = densidadeDeBorda(mapa, reg), h = new Uint16Array(reg.n * reg.n * 2), zero = THREE.DataUtils.toHalfFloat(0);
    const dh = new Uint16Array(256); for (let q = 0; q < 256; q++) dh[q] = THREE.DataUtils.toHalfFloat(q / 255);
    for (let k = 0; k < mapa.grama.length; k++) { h[k * 2] = THREE.DataUtils.toHalfFloat(mapa.grama[k] ? mapa.alt[k] : -1000); h[k * 2 + 1] = mapa.grama[k] ? dh[dens[k]] : zero; }
    const tx = this.texAlt = this._guardar(new THREE.DataTexture(h, reg.n, reg.n, THREE.RGFormat, THREE.HalfFloatType));
    tx.minFilter = tx.magFilter = THREE.NearestFilter; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.generateMipmaps = false; tx.needsUpdate = true;
    /* o ruído das touceiras, manchas e falhas (tileável, 256², 4 escalas) */
    const tr = this.texRuido = this._guardar(new THREE.DataTexture(ruidoTileavel(256), 256, 256, THREE.RGBAFormat, THREE.UnsignedByteType));
    tr.colorSpace = THREE.NoColorSpace; tr.wrapS = tr.wrapT = THREE.RepeatWrapping; tr.minFilter = tr.magFilter = THREE.LinearFilter; tr.generateMipmaps = false; tr.needsUpdate = true;
    this.cfg.grama.forEach((cg) => this._camadaGrama(cg));
    try { await this._arvores(casa, ctx); } catch (e) { this.info.erroArvores = String(e && e.message || e); try { console.warn('entorno (árvores):', e); } catch (x) { /* sem console */ } }
    this.info.ms = Math.round(performance.now() - t0);
    this.info.lamina = this.camadas.reduce((s, q) => s + q.n * q.n, 0);
    return this.info;
  }

  /* ----------------------------------------------------------- grama */
  /* GRAMA CURTA E VARIADA (frente P, 21/10/2026). A de antes era um tapete de espetos iguais, de 11 a 23 cm, que na altura do olho
     escondia a calçada e a casa. Agora: gramado aparado (alt. de 3 a 9 cm, uma haste maior de vez em quando), lâmina estreita, TOUCEIRAS
     (altura e cor mudam em manchas de 0,5 a 5 m), falhas e manchas de palha, e mais rala perto da câmera (a textura do chão aparece
     entre as lâminas). Nunca perto de piso/calçada/laje: o mapa traz, por célula, a densidade pela distância até a superfície que não é grama.
     cg = { R, s, h, w, forma (3 | 5 vértices), ralo: [fração, d0, d1] }: R raio, s passo da grade, h altura, w meia-largura (m) */
  _camadaGrama(cg) {
    const s = cg.s, n = Math.ceil(2 * cg.R / s), reg = this.reg, uCell = uniform(new THREE.Vector2());
    /* lâmina: 5 vértices (um degrau e a ponta) ou, de longe, um triângulo só — x = lado (−1…1), y = ao longo (0…1) */
    const P = cg.forma === 3 ? [[-1, 0], [1, 0], [0, 1]] : [[-1, 0], [1, 0], [-0.62, 0.5], [0.62, 0.5], [0, 1]];
    const geo = this._guardar(new THREE.InstancedBufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.flatMap((q) => [q[0], q[1], 0])), 3));
    geo.setIndex(cg.forma === 3 ? [0, 1, 2] : [0, 1, 2, 1, 3, 2, 2, 3, 4]);
    geo.instanceCount = n * n;
    const fi = float(instanceIndex), lin = floor(fi.div(n)), col = fi.sub(lin.mul(n)), lo = uCell.sub(n / 2);
    const a = vec2(col, lin).sub(lo), cel = lo.add(a.sub(floor(a.div(n)).mul(n)));   /* a célula do mundo desta lâmina (reaproveitada na borda) */
    const sd = uint(cel.x.add(32768)).mul(uint(73856093)).bitXor(uint(cel.y.add(32768)).mul(uint(19349663)));
    const r1 = hash(sd), r2 = hash(sd.add(uint(1))), r3 = hash(sd.add(uint(2))), r4 = hash(sd.add(uint(3))), r5 = hash(sd.add(uint(4))), r6 = hash(sd.add(uint(5))), r7 = hash(sd.add(uint(6))), r8 = hash(sd.add(uint(7))), r9 = hash(sd.add(uint(8)));
    const px = cel.x.add(r1).mul(s), pz = cel.y.add(r2).mul(s);
    const uvh = vec2(px.sub(reg.x0), pz.sub(reg.z0)).div(reg.lado);
    const mp = texture(this.texAlt, uvh).level(0), y0 = mp.r;   /* R = altura do chão de grama; G = densidade pela distância ao piso (0 colado nele, 1 longe) */
    const dentro = step(0, uvh.x).mul(step(uvh.x, 1)).mul(step(0, uvh.y)).mul(step(uvh.y, 1)), tem = step(-500, y0).mul(dentro);
    const dist = length(vec3(px, y0, pz).sub(this.uCam)), fade = float(1).sub(smoothstep(cg.R * 0.55, cg.R * 0.96, dist)).mul(tem);
    /* o ruído (tileável, 4 escalas) decide manchas, touceiras e falhas — o mesmo em cada lâmina, nunca por quadro */
    const rz = texture(this.texRuido, vec2(px, pz).div(PERIODO_RUIDO)).level(0), nP = rz.r, nM = rz.g, nF = rz.b, nT = rz.a;
    const rl = cg.ralo || [1, 0, 1], perto = mix(float(rl[0]), float(1), smoothstep(rl[1], rl[2], dist));
    const dens = mp.g.mul(perto).mul(mix(0.42, 1, smoothstep(0.28, 0.52, nT)));
    const vivo = step(r6, dens);
    const yaw = r3.mul(6.2831853);
    const haste = mix(float(1), float(1.9), step(0.97, r8));   /* uma lâmina em ~33 é uma haste mais alta */
    const touceira = mix(0.62, 1.4, nF).mul(mix(0.82, 1.22, nM));
    const alt = float(cg.h).mul(r4.mul(0.85).add(0.55)).mul(touceira).mul(haste).mul(fade).mul(vivo), larg = float(cg.w).mul(r5.mul(0.5).add(0.75)).mul(fade);
    const T = positionGeometry.y, lat = positionGeometry.x, T2 = T.mul(T), f = vec2(cos(yaw), sin(yaw)), l = vec2(sin(yaw).negate(), cos(yaw));
    const gust = sin(this.uT.mul(1.3).add(px.mul(0.31)).add(pz.mul(0.23))).mul(0.5).add(sin(this.uT.mul(2.9).add(px.mul(0.9)).sub(pz.mul(0.7))).mul(0.25)).add(0.4);
    const off = f.mul(r7.mul(0.24).add(0.06).mul(alt).mul(T2)).add(this.uVento.mul(gust.mul(T2).mul(alt).mul(0.5)));
    const pos = vec3(px.add(l.x.mul(lat).mul(larg)).add(off.x), y0.sub(0.015).add(T.mul(alt).mul(float(1).sub(T2.mul(0.16)))), pz.add(l.y.mul(lat).mul(larg)).add(off.y));
    /* cor: raiz escura → ponta clara; claridade por lâmina (±30 %), por mancha, e manchas de palha (verde-amarelado seco) onde o ruído grande passa de 0,62 */
    const macro = mx_fractal_noise_float(vec2(px, pz).mul(0.045), 3, 2.0, 0.5).mul(0.5).add(0.5), vari = r4.mul(0.6).add(0.7);
    const seco = smoothstep(0.60, 0.80, nP), claro = mix(0.84, 1.16, nM);
    const ponta = mix(vec3(0.28, 0.42, 0.085), vec3(0.37, 0.37, 0.10), seco), raiz = vec3(0.10, 0.18, 0.035);
    const cor = mix(raiz, ponta, T.pow(0.75)).mul(vari).mul(claro).mul(mix(0.72, 1.2, macro));
    const amarela = mix(vec3(1, 1, 1), vec3(1.4, 1.2, 0.6), step(0.955, r9));   /* uma lâmina em ~22 é palha */
    const vCor = varying(cor.mul(amarela)), vNor = varying(normalize(vec3(f.x.mul(0.45).add(l.x.mul(lat).mul(0.35)), 1, f.y.mul(0.45).add(l.y.mul(lat).mul(0.35)))));
    const m = this._guardar(new THREE.MeshStandardNodeMaterial({ roughness: 0.62, metalness: 0, side: THREE.DoubleSide }));
    m.positionNode = pos; m.colorNode = vCor; m.normalNode = transformNormalToView(vNor);
    const ms = this._marcar(new THREE.Mesh(geo, m)); ms.castShadow = false; ms.receiveShadow = true; ms.name = 'grama';
    this.grupo.add(ms);
    this.camadas.push({ n, s, uCell, mesh: ms });
  }

  /* ----------------------------------------------------------- árvores */
  async _arvores(casa, ctx) {
    const cfg = this.cfg, reg = this.reg;
    /* 1) a geometria de cada espécie e nível: gerada uma vez (EZ-Tree com a semente do preset) */
    const rnd = mulberry32(7);
    const gerar = (preset, kFolha) => {
      /* o cartão de folha do preset é pequeno para a copa ficar cheia: aumenta o tamanho (a semente é a mesma, a árvore também) */
      const t = new Tree(), js = loadPreset(preset); js.leaves.size *= (kFolha || 1); t.loadFromJson(js);
      const gR = t.branchesMesh.geometry, gF = t.leavesMesh.geometry;
      gR.computeBoundingBox(); gF.computeBoundingBox();
      const H = gR.boundingBox.max.y, copa = Math.max(gF.boundingBox.max.x - gF.boundingBox.min.x, gF.boundingBox.max.z - gF.boundingBox.min.z) / 2;
      try { t.branchesMesh.material.dispose(); t.leavesMesh.material.dispose(); } catch (e) { /* sem material */ }
      return { gR, gF, H: Math.max(H, gF.boundingBox.max.y), copa, tri: (t.branches.indices.length + t.leaves.indices.length) / 3, opts: t.options };
    };
    const folhas = {}, casca = await this._casca();
    const especies = ESPECIES.map((e) => {
      const p0 = e.geometria === 'palmeira' ? gerarPalmeira(rnd) : gerar(e.perto, e.kFolha), p1 = e.longe ? gerar(e.longe, e.kFolha) : null;
      if (!folhas[e.folha]) folhas[e.folha] = this._guardar(texturaFolha(e.folha, mulberry32(e.folha.length * 977 + 5)));
      return Object.assign({}, e, { copaK: p0.copa / p0.H, lod: [p0, p1].filter(Boolean) });
    });
    /* 2) onde plantar (só se há grama, fora da casa; a plantas do modelo ficam como estão) */
    const evitar = ctx.camera ? [{ x: ctx.camera.position.x, z: ctx.camera.position.z, r: 5 }] : [];
    const diag = {};
    this._especies = especies; this._cascaTex = casca; this._folhas = folhas;   /* [Cena: objetos] guardados para reconstruir os baldes quando a pessoa planta à mão */
    /* [Cena: objetos] opcao `auto:false` = sem o plantio aleatório (a grama fica); as plantadas à mão (`manual`) somam-se ao automático */
    this._autoArvores = this.o.auto === false ? [] : plantar({ reg, mapa: this.mapa, casa, semente: sementeDe(casa), especies, nArv: cfg.arvores, nArb: cfg.arbustos, evitar, diag });
    this.arvores = this._autoArvores.concat(this._arvoresManuais());
    this.info.plantio = { casa: [casa.minx, casa.maxx, casa.minz, casa.maxz].map((v) => +v.toFixed(1)), recusas: diag };
    /* SOMBRA: a sombra das folhas (cartões com recorte) custou 2,2 ms dos 2,9 ms do entorno no Quiosque (medida na RTX 5060). Só as
       árvores mais próximas da casa (onde a sombra cai no que se vê) projetam; as outras e todos os arbustos só recebem sombra. */
    const dCasa = (q) => Math.hypot(Math.max(casa.minx - q.x, 0, q.x - casa.maxx), Math.max(casa.minz - q.z, 0, q.z - casa.maxz));
    this._autoArvores.filter((q) => q.tipo === 'arvore').sort((a, b) => dCasa(a) - dCasa(b)).slice(0, cfg.sombras).forEach((q) => { q.sombra = true; });   /* [Cena: objetos] só as automáticas; as manuais têm a regra delas */
    this.info.arvores = this.arvores.filter((q) => q.tipo === 'arvore').length; this.info.arbustos = this.arvores.filter((q) => q.tipo === 'arbusto').length;
    if (!this.arvores.length) return;
    this._baldesDeNovo(ctx.camera);
  }
  /* [Cena: objetos] AS PLANTADAS À MÃO (OrçaPRO Cena). lista = [{sp, x, y, z, yaw, esc, h?}] em coordenadas do motor. Refaz só os baldes de
     instâncias (a grama e o resto do entorno ficam como estão); a geometria das espécies já foi gerada em _arvores (ou é gerada agora). */
  _arvoresManuais() {
    const L = this._manual || [], esp = {}; (this._especies || []).forEach((e) => { esp[e.id] = e; });
    return L.filter((m) => esp[m.sp]).map((m) => {
      const e = esp[m.sp], h = m.h > 0 ? m.h : (e.alt[0] + e.alt[1]) / 2;
      /* a sombra do sol: as árvores (não os arbustos) plantadas à mão projetam, até um teto (cada uma custa ~0,4 ms de placa) */
      return { x: m.x, y: m.y, z: m.z, sp: e.id, tipo: e.tipo, h: h, r: h * e.copaK, yaw: m.yaw || 0, esc: m.esc > 0 ? m.esc : 1, sombra: e.tipo === 'arvore', manual: true, ref: m.ref };
    });
  }
  /* liga/desliga o plantio AUTOMÁTICO (as plantadas à mão e a grama ficam). As automáticas guardadas voltam ao ligar de novo. */
  definirAuto(on) {
    if (this._autoGuardadas === undefined) this._autoGuardadas = this._autoArvores || [];
    this._autoArvores = on ? this._autoGuardadas : [];
    this.arvores = this._autoArvores.concat(this._arvoresManuais());
    this.info = this.info || {}; this.info.arvores = this.arvores.filter((q) => q.tipo === 'arvore').length; this.info.arbustos = this.arvores.filter((q) => q.tipo === 'arbusto').length;
    if (this._especies) this._baldesDeNovo(this._camera);
    return on;
  }
  async definirManual(lista) {
    this._manual = Array.isArray(lista) ? lista : [];
    if (!this._especies) await this._prepararEspecies();
    const n0 = this.baldes.length;
    this.arvores = (this._autoArvores || []).concat(this._arvoresManuais());
    this.info = this.info || {};
    this.info.arvores = this.arvores.filter((q) => q.tipo === 'arvore').length; this.info.arbustos = this.arvores.filter((q) => q.tipo === 'arbusto').length; this.info.manuais = this._manual.length;
    this._baldesDeNovo(this._camera);
    return { baldes: this.baldes.length, antes: n0 };
  }
  /* só as espécies (sem plantar nem criar baldes): o entorno que não montou (modelo sem grama) também aceita árvore à mão */
  async _prepararEspecies() {
    if (this._especies) return;
    const rnd = mulberry32(7), casca = await this._casca();
    const folhas = {};
    this._especies = ESPECIES.map((e) => {
      const p0 = e.geometria === 'palmeira' ? gerarPalmeira(rnd) : this._gerarEz(e.perto, e.kFolha), p1 = e.longe ? this._gerarEz(e.longe, e.kFolha) : null;
      if (!folhas[e.folha]) folhas[e.folha] = this._guardar(texturaFolha(e.folha, mulberry32(e.folha.length * 977 + 5)));
      return Object.assign({}, e, { copaK: p0.copa / p0.H, lod: [p0, p1].filter(Boolean) });
    });
    this._cascaTex = casca; this._folhas = folhas;
  }
  _gerarEz(preset, kFolha) {
    const t = new Tree(), js = loadPreset(preset); js.leaves.size *= (kFolha || 1); t.loadFromJson(js);
    const gR = t.branchesMesh.geometry, gF = t.leavesMesh.geometry;
    gR.computeBoundingBox(); gF.computeBoundingBox();
    const H = gR.boundingBox.max.y, copa = Math.max(gF.boundingBox.max.x - gF.boundingBox.min.x, gF.boundingBox.max.z - gF.boundingBox.min.z) / 2;
    try { t.branchesMesh.material.dispose(); t.leavesMesh.material.dispose(); } catch (e) { /* sem material */ }
    return { gR, gF, H: Math.max(H, gF.boundingBox.max.y), copa, tri: (t.branches.indices.length + t.leaves.indices.length) / 3, opts: t.options };
  }
  /* um InstancedMesh de ramos e outro de folhas por (espécie × nível); refeito do zero a cada chamada (os materiais por espécie ficam) */
  _baldesDeNovo(camera) {
    const especies = this._especies, casca = this._cascaTex, folhas = this._folhas;
    this.baldes.forEach((b) => { [b.ramos, b.folhas].forEach((im) => { if (im.parent) im.parent.remove(im); try { im.geometry.dispose(); im.dispose(); } catch (e) { /* já descartado */ } }); });
    this.baldes = []; this._matsEsp = this._matsEsp || {};
    if (!this.arvores.length) return;
    const usadas = new Set(this.arvores.map((q) => q.sp));
    especies.filter((e) => usadas.has(e.id)).forEach((e) => {
      const ME = this._matsEsp[e.id] || (this._matsEsp[e.id] = { r: this._materialCasca(e, casca), f: this._materialFolha(e, folhas[e.folha]) }), matR = ME.r, matF = ME.f;   /* [Cena: objetos] material por espécie, refeito não */
      /* dois grupos por espécie e nível: os que projetam sombra (poucos) e os que só recebem */
      [true, false].forEach((sombra) => {
        const total = this.arvores.filter((q) => q.sp === e.id && !!q.sombra === sombra).length; if (!total) return;
        e.lod.forEach((lv, k) => {
          const mk = (geo, mat, nome) => {
            const g = this._guardar(geo.clone()); g.setAttribute('aBase', new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4));
            const im = this._marcar(new THREE.InstancedMesh(g, mat, total)); im.count = 0; im.visible = false; im.castShadow = sombra; im.receiveShadow = true; im.name = e.id + '-' + nome + '-' + k + (sombra ? '-s' : '');
            this.grupo.add(im); return im;
          };
          this.baldes.push({ sp: e.id, lod: Math.min(k, e.lod.length - 1), H: lv.H, sombra, ramos: mk(lv.gR, matR, 'ramos'), folhas: mk(lv.gF, matF, 'folhas') });
        });
      });
    });
    this.info.triangulos = especies.filter((e) => usadas.has(e.id)).reduce((s, e) => s + e.lod[0].tri, 0);
    this._lodPos = null; if (camera) this._atualizarLOD(camera, true);
  }
  async _casca() {
    const base = (n) => new URL('../img/texturas/entorno/casca/' + n, import.meta.url).href, il = new THREE.ImageLoader(), r = {};
    await Promise.all([['cor', true], ['normal', false], ['rugosidade', false]].map(([n, srgb]) =>
      il.loadAsync(base(n + '.jpg')).then((img) => {
        const t = new THREE.Texture(img); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = this.o.aniso || 8; t.needsUpdate = true;
        r[n] = this._guardar(t);
      }, () => { /* sem a textura: a casca fica só com a cor */ })));
    return r;
  }
  /* O VENTO (o mesmo nos ramos e nas folhas, para o que está preso se mexer junto): balança com o quadrado da altura */
  _vento(aBase) {
    const world = positionLocal, h = clamp(world.y.sub(aBase.y).div(aBase.w), 0, 1), w = h.mul(h), fase = aBase.x.mul(0.37).add(aBase.z.mul(0.53));
    const g = sin(this.uT.mul(1.1).add(world.x.mul(0.21)).add(world.z.mul(0.17)).add(fase)).mul(0.6).add(sin(this.uT.mul(2.3).add(world.x.mul(0.5)).sub(world.z.mul(0.4))).mul(0.25)).add(0.35);
    return { w, g, fase, desloc: vec3(this.uVento.x, 0, this.uVento.y).mul(g.mul(w).mul(aBase.w).mul(0.02)) };
  }
  _materialCasca(e, tex) {
    const m = this._guardar(new THREE.MeshStandardNodeMaterial({ color: e.casca, roughness: 0.95, metalness: 0 }));
    ['cor', 'normal', 'rugosidade'].forEach((n) => {
      if (!tex[n]) return; const t = tex[n].clone(); t.repeat.set(0.5, 1 / 2.5); t.needsUpdate = true; this._guardar(t);
      if (n === 'cor') m.map = t; else if (n === 'normal') { m.normalMap = t; m.normalScale.set(1.1, 1.1); } else m.roughnessMap = t;
    });
    const ab = attribute('aBase', 'vec4'); m.positionNode = positionLocal.add(this._vento(ab).desloc);
    return m;
  }
  _materialFolha(e, tex) {
    const m = this._guardar(new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }));
    const ab = attribute('aBase', 'vec4'), v = this._vento(ab), mapa = texture(tex, uv());
    /* as folhas tremem mais na ponta do cartão (uv.y) e em frequência alta */
    const tremor = sin(this.uT.mul(4.3).add(v.fase.mul(3.1)).add(positionLocal.x.mul(2.3)).add(positionLocal.z.mul(1.9))).mul(uv().y).mul(0.05).mul(v.w.mul(0.6).add(0.4));
    const w = positionLocal.add(v.desloc).add(vec3(tremor, tremor.mul(0.5), tremor.negate()));
    m.positionNode = w;
    const c = vec3(e.tinta[0], e.tinta[1], e.tinta[2]);
    /* copa como um volume: a normal aponta do centro da copa para fora (com viés para cima) — a folha plana saía chapada */
    const centro = vec3(ab.x, ab.y.add(ab.w.mul(e.centroK || 0.56)), ab.z), dc = w.sub(centro), raio = ab.w.mul(e.raioK || 0.5).max(0.3);
    const nW = normalize(normalize(dc).add(vec3(0, 0.55, 0)));
    const dentro = smoothstep(0.15, 0.95, length(dc).div(raio)), ruido = sin(w.x.mul(7.1).add(w.y.mul(5.3)).add(w.z.mul(6.7))).mul(0.07).add(1);
    m.colorNode = vec4(mapa.rgb.mul(c).mul(mix(0.7, 1.15, dentro)).mul(ruido).mul(1.7), mapa.a);   /* ×1,7: a folha desenhada em sRGB escuro saía quase preta ao lado do gramado (Casa 487, 20/10) */
    m.alphaTest = 0.42;
    m.maskShadowNode = mapa.a.greaterThan(0.42);
    m.normalNode = transformNormalToView(nW);
    return m;
  }
  /* o nível de detalhe de cada árvore pela distância à câmera; refaz as matrizes só se algo mudou */
  _atualizarLOD(camera, forcar) {
    if (!this.baldes.length) return;
    const cp = camera.position;
    if (!forcar && this._lodPos && this._lodPos.distanceToSquared(cp) < 2.25) return;
    this._lodPos = (this._lodPos || new THREE.Vector3()).copy(cp);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    this.baldes.forEach((b) => {
      let k = 0; const am = b.ramos.instanceMatrix.array, ab1 = b.ramos.geometry.getAttribute('aBase').array, ab2 = b.folhas.geometry.getAttribute('aBase').array, af = b.folhas.instanceMatrix.array;
      const temLongo = this.baldes.some((q) => q.sp === b.sp && q.lod === 1);
      this.arvores.forEach((a) => {
        if (a.sp !== b.sp || !!a.sombra !== b.sombra) return;
        const d = Math.hypot(a.x - cp.x, a.z - cp.z, (a.y + a.h / 2) - cp.y);
        const lod = d < DIST_LOD0 || !temLongo ? 0 : 1;
        if (lod !== b.lod || d > DIST_LOD1) return;
        const sc = a.h / b.H * a.esc; P.set(a.x, a.y - 0.05, a.z); Q.setFromAxisAngle(Y, a.yaw); S.set(sc, sc, sc); M.compose(P, Q, S);
        M.toArray(am, k * 16); M.toArray(af, k * 16);
        ab1[k * 4] = ab2[k * 4] = a.x; ab1[k * 4 + 1] = ab2[k * 4 + 1] = a.y; ab1[k * 4 + 2] = ab2[k * 4 + 2] = a.z; ab1[k * 4 + 3] = ab2[k * 4 + 3] = a.h * a.esc;
        k++;
      });
      [b.ramos, b.folhas].forEach((im) => { im.count = k; im.visible = k > 0; im.instanceMatrix.needsUpdate = true; im.geometry.getAttribute('aBase').needsUpdate = true; });
    });
  }

  /* ----------------------------------------------------------- por quadro */
  atualizar(dt, camera) {
    if (!this.ligado) return;
    this.uT.value += Math.min(0.1, dt || 0.016); this.uCam.value.copy(camera.position);
    this.camadas.forEach((q) => q.uCell.value.set(Math.floor(camera.position.x / q.s), Math.floor(camera.position.z / q.s)));
    this._atualizarLOD(camera, false);
  }
  /* O CHÃO TINGIDO: quando o modelo não tem grama (a topografia do IFC vem como terra/areia), o chão que vira gramado ganha, por baixo das
     lâminas, um verde com a mesma variação de grande escala da grama — senão o gramado ralo parece capim em cima de areia. A malha é a do
     modelo (mesmos vértices); só o material é uma cópia com o verde ligado ao botão Entorno (uLig). scene: a cena do motor; cena: {grupos}. */
  tingirChao(scene, cena) {
    if (!this.chaoIdx || !this.chaoIdx.length || !scene) return 0;
    const alvo = new Set(this.chaoIdx.map((i) => cena.grupos[i] && cena.grupos[i].pos)), vistos = new Map(); let n = 0;
    scene.traverse((o) => {
      if (!o.isMesh || (o.userData && o.userData.entorno) || !o.geometry) return;
      const pa = o.geometry.getAttribute && o.geometry.getAttribute('position'); if (!pa || !alvo.has(pa.array)) return;
      const m0 = o.material; if (!m0 || Array.isArray(m0)) return;
      let m = vistos.get(m0);
      if (!m) {
        m = m0.clone(); m.setupEnvironment = m0.setupEnvironment; m.userData = Object.assign({}, m0.userData); vistos.set(m0, m);
        const c = m0.color || { r: 1, g: 1, b: 1 }, cor = vec3(c.r, c.g, c.b);
        const base = m0.colorNode || (m0.map ? texture(m0.map, uv()).rgb.mul(cor) : cor);
        const macro = mx_fractal_noise_float(positionWorld.xz.mul(0.045), 3, 2.0, 0.5).mul(0.5).add(0.5);
        const verde = mix(vec3(0.42, 0.60, 0.20), vec3(0.62, 0.78, 0.30), macro);
        m.colorNode = mix(base, base.mul(verde), this.uLig);
        this._guardar(m);
      }
      o.material = m; n++;
    });
    return n;
  }
  ligar(on) { this.ligado = !!on; this.grupo.visible = this.ligado; this.uLig.value = this.ligado ? 1 : 0; return this.ligado; }
  descartar() {
    this.recursos.forEach((r) => { try { r.dispose(); } catch (e) { /* já descartado */ } }); this.recursos = [];
    this.grupo.traverse((o) => { if (o.isInstancedMesh) { try { o.dispose(); } catch (e) { /* já descartado */ } } });
    if (this.grupo.parent) this.grupo.parent.remove(this.grupo);
    this.grupo.clear(); this.camadas = []; this.baldes = []; this.arvores = []; this.mapa = null; this.texAlt = null;
  }
}

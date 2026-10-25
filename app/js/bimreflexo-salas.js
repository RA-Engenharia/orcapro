/* =====================================================================
 * bimreflexo-salas.js — a GEOMETRIA PURA dos reflexos do render ao vivo
 * (frente R, 20/10/2026; sem three, sem DOM: testável em node —
 * tools/test-bimreflexo.js). Quem usa: js/bimreflexo.js.
 *
 *   salasDe(entrada)       os cômodos do BIM → caixas (min/max), centro da
 *                          sonda e a GRADE de pertença (em que cômodo cada
 *                          ponto do espaço está), dilatada 2 células para
 *                          o piso/forro/parede encostados acharem o cômodo.
 *   octaCod / octaDec      direção ↔ quadrado [0,1]² (mapa octaédrico): a
 *                          sonda vira um ladrilho 2D no atlas.
 *   projetarCaixa          a correção de paralaxe (box projection): o raio
 *                          refletido sai do PONTO e bate na caixa do cômodo;
 *                          a direção lida na sonda é do CENTRO até ali.
 *   amostrasGGX            as direções do pré-filtro por rugosidade (GGX,
 *                          Hammersley) com o nível de mip de cada uma
 *                          (filtered importance sampling, Karis 2013).
 *   planosDoPiso           separa os triângulos virados para cima por plano
 *                          (o piso de cada pavimento) e devolve os maiores.
 * ===================================================================== */

/* ponto dentro do polígono (x, z) — paridade do raio */
export function dentroPoligono(px, pz, pol) {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const xi = pol[i][0], zi = pol[i][1], xj = pol[j][0], zj = pol[j][1];
    if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / ((zj - zi) || 1e-12) + xi)) d = !d;
  }
  return d;
}
function areaCentro(pol) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const c = pol[j][0] * pol[i][1] - pol[i][0] * pol[j][1];
    a += c; cx += (pol[j][0] + pol[i][0]) * c; cz += (pol[j][1] + pol[i][1]) * c;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) { let sx = 0, sz = 0; pol.forEach((p) => { sx += p[0]; sz += p[1]; }); return { area: 0, c: [sx / pol.length, sz / pol.length] }; }
  return { area: Math.abs(a), c: [cx / (6 * a), cz / (6 * a)] };
}

/* entrada: { ambientes: [{ nome, contorno: [[x,z]…], furos: [[[x,z]…]…], base, topo }], caixas: [{ nome, min:[x,y,z], max:[x,y,z] }],
             obra: { min, max } (caixa da casa — reserva quando não há cômodo), passo (0,2 m), teto (64) }
   (coordenadas do MOTOR: as do BIM menos a origem da extração)
   devolve: { salas: [{ nome, min, max, centro, reserva }], grade: { origem, passo, n, dados: Uint8Array (índice + 1; 0 = fora) } } */
export function salasDe(entrada) {
  const e = entrada || {}, passo = e.passo || 0.2, teto = Math.min(255, e.teto || 64), salas = [];
  (e.ambientes || []).forEach((a) => {
    const pol = (a.contorno || []).filter((p) => p && isFinite(p[0]) && isFinite(p[1]));
    if (pol.length < 3 || !(a.topo > a.base)) return;
    const ac = areaCentro(pol); if (ac.area < 1.2) return;
    let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
    pol.forEach((p) => { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[1]); mxz = Math.max(mxz, p[1]); });
    const furos = (a.furos || []).filter((f) => f && f.length >= 3);
    const dentro = (x, z) => dentroPoligono(x, z, pol) && !furos.some((f) => dentroPoligono(x, z, f));
    let c = ac.c;
    if (!dentro(c[0], c[1])) {
      /* polígono em L/U: o centroide cai fora — vale o ponto de dentro mais perto dele */
      let melhor = null, dm = Infinity;
      for (let x = mnx + passo / 2; x < mxx; x += passo) for (let z = mnz + passo / 2; z < mxz; z += passo) {
        if (!dentro(x, z)) continue; const d = (x - c[0]) ** 2 + (z - c[1]) ** 2; if (d < dm) { dm = d; melhor = [x, z]; }
      }
      if (!melhor) return; c = melhor;
    }
    const h = a.topo - a.base;
    salas.push({ nome: a.nome || '', min: [mnx, a.base, mnz], max: [mxx, a.topo, mxz], centro: [c[0], a.base + Math.min(1.5, h * 0.5), c[1]], area: ac.area, dentro, reserva: false });
  });
  (e.caixas || []).forEach((b) => {
    if (!b || !b.min || !b.max) return;
    const dx = b.max[0] - b.min[0], dy = b.max[1] - b.min[1], dz = b.max[2] - b.min[2];
    if (dx * dz < 1.2 || dy < 1.8) return;
    salas.push({ nome: b.nome || '', min: b.min.slice(), max: b.max.slice(), centro: [b.min[0] + dx / 2, b.min[1] + Math.min(1.5, dy * 0.5), b.min[2] + dz / 2], area: dx * dz,
      dentro: (x, z) => x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2], reserva: false });
  });
  /* sem cômodo nenhum (IFC sem IfcSpace): a caixa da obra inteira, com a sonda no meio a 1,5 m do chão — marcada "reserva"
     (o material só usa onde o céu quase não chega; a fachada continua refletindo o céu) */
  if (!salas.length && e.obra && e.obra.min && e.obra.max) {
    const b = e.obra, dx = b.max[0] - b.min[0], dy = b.max[1] - b.min[1], dz = b.max[2] - b.min[2];
    if (dx > 0.5 && dz > 0.5 && dy > 0.5) salas.push({ nome: 'obra', min: b.min.slice(), max: b.max.slice(), centro: [b.min[0] + dx / 2, b.min[1] + Math.min(1.5, dy * 0.5), b.min[2] + dz / 2], area: dx * dz, dentro: () => true, reserva: true });
  }
  /* as maiores primeiro (o teto do atlas corta as menores) */
  salas.sort((a, b) => b.area - a.area); salas.length = Math.min(salas.length, teto);
  if (!salas.length) return { salas: [], grade: null };
  /* a GRADE: célula de `passo` m; borda de 3 células vazias (a leitura fora da grade cai na borda = fora) */
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  salas.forEach((s) => { for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], s.min[k]); mx[k] = Math.max(mx[k], s.max[k]); } });
  const borda = passo * 3, origem = mn.map((v) => v - borda), n = mx.map((v, k) => Math.max(1, Math.ceil((v + borda - origem[k]) / passo)));
  if (n[0] * n[1] * n[2] > 24e6) return { salas: [], grade: null, erro: 'grade grande demais' };
  const nx = n[0], ny = n[1], nz = n[2], dados = new Uint8Array(nx * ny * nz);
  salas.forEach((s, si) => {
    const i0 = Math.max(0, Math.floor((s.min[0] - origem[0]) / passo)), i1 = Math.min(nx - 1, Math.floor((s.max[0] - origem[0]) / passo));
    const k0 = Math.max(0, Math.floor((s.min[2] - origem[2]) / passo)), k1 = Math.min(nz - 1, Math.floor((s.max[2] - origem[2]) / passo));
    const j0 = Math.max(0, Math.floor((s.min[1] - 0.05 - origem[1]) / passo)), j1 = Math.min(ny - 1, Math.floor((s.max[1] + 0.05 - origem[1]) / passo));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      if (!s.dentro(origem[0] + (i + 0.5) * passo, origem[2] + (k + 0.5) * passo)) continue;
      for (let j = j0; j <= j1; j++) { const q = i + nx * (j + ny * k); if (!dados[q]) dados[q] = si + 1; }
    }
  });
  /* DILATAÇÃO: 2 passadas — o piso a 0,3 cm da base, o rodapé, a face da parede e o forro ficam dentro do cômodo */
  for (let p = 0; p < 2; p++) {
    const ant = dados.slice();
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const q = i + nx * (j + ny * k); if (ant[q]) continue;
      const v = (i > 0 && ant[q - 1]) || (i < nx - 1 && ant[q + 1]) || (k > 0 && ant[q - nx * ny]) || (k < nz - 1 && ant[q + nx * ny]) || (j > 0 && ant[q - nx]) || (j < ny - 1 && ant[q + nx]) || 0;
      if (v) dados[q] = v;
    }
  }
  return { salas: salas.map((s) => ({ nome: s.nome, min: s.min, max: s.max, centro: s.centro, area: Math.round(s.area * 100) / 100, reserva: s.reserva })), grade: { origem, passo, n, dados } };
}
/* em que sala está um ponto (a mesma leitura que o material faz na placa) */
export function salaDoPonto(grade, p) {
  if (!grade) return -1;
  const i = Math.floor((p[0] - grade.origem[0]) / grade.passo), j = Math.floor((p[1] - grade.origem[1]) / grade.passo), k = Math.floor((p[2] - grade.origem[2]) / grade.passo);
  const [nx, ny, nz] = grade.n; if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1;
  return grade.dados[i + nx * (j + ny * k)] - 1;
}

/* MAPA OCTAÉDRICO (y para cima): direção ↔ [0,1]² — o mesmo par que o shader usa (js/bimreflexo.js) */
export function octaCod(d) {
  const s = Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) || 1;
  let x = d[0] / s, z = d[2] / s;
  if (d[1] < 0) { const ox = x, oz = z; x = (1 - Math.abs(oz)) * (ox >= 0 ? 1 : -1); z = (1 - Math.abs(ox)) * (oz >= 0 ? 1 : -1); }
  return [x * 0.5 + 0.5, z * 0.5 + 0.5];
}
export function octaDec(u, v) {
  let x = u * 2 - 1, z = v * 2 - 1; const y = 1 - Math.abs(x) - Math.abs(z), t = Math.max(-y, 0);
  x += x >= 0 ? -t : t; z += z >= 0 ? -t : t;
  const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l];
}
/* CORREÇÃO DE PARALAXE: do ponto P na direção R até a parede da caixa; a direção na sonda (centro C) é C → esse ponto */
export function projetarCaixa(P, R, min, max, C) {
  let t = Infinity;
  for (let k = 0; k < 3; k++) { const r = Math.abs(R[k]) < 1e-5 ? (R[k] < 0 ? -1e-5 : 1e-5) : R[k]; t = Math.min(t, Math.max((max[k] - P[k]) / r, (min[k] - P[k]) / r)); }
  t = Math.max(t, 0);
  const h = [P[0] + R[0] * t - C[0], P[1] + R[1] * t - C[1], P[2] + R[2] * t - C[2]], l = Math.hypot(h[0], h[1], h[2]) || 1;
  return [h[0] / l, h[1] / l, h[2] / l];
}

/* PRÉ-FILTRO GGX: para cada nível (rugosidade perceptual r = nível / (níveis − 1), α = r²), K direções L no espaço da
   normal (N = V = (0,0,1)) e o mip do cubo de cada uma — [Lx, Ly, Lz, mip] por amostra, nível 1 primeiro */
function radical(i) { let b = i >>> 0; b = ((b << 16) | (b >>> 16)) >>> 0; b = (((b & 0x55555555) << 1) | ((b & 0xAAAAAAAA) >>> 1)) >>> 0; b = (((b & 0x33333333) << 2) | ((b & 0xCCCCCCCC) >>> 2)) >>> 0; b = (((b & 0x0F0F0F0F) << 4) | ((b & 0xF0F0F0F0) >>> 4)) >>> 0; b = (((b & 0x00FF00FF) << 8) | ((b & 0xFF00FF00) >>> 8)) >>> 0; return b / 4294967296; }
export function amostrasGGX(niveis, K, ladoCubo) {
  const out = new Float32Array((niveis - 1) * K * 4), omP = 4 * Math.PI / (6 * ladoCubo * ladoCubo);
  for (let l = 1; l < niveis; l++) {
    const r = l / (niveis - 1), a = Math.max(r * r, 1e-4), a2 = a * a;
    for (let k = 0; k < K; k++) {
      const u1 = (k + 0.5) / K, u2 = radical(k), phi = 2 * Math.PI * u2;
      const ct = Math.sqrt((1 - u1) / (1 + (a2 - 1) * u1)), st = Math.sqrt(Math.max(0, 1 - ct * ct));
      const H = [st * Math.cos(phi), st * Math.sin(phi), ct], L = [2 * ct * H[0], 2 * ct * H[1], 2 * ct * H[2] - 1];
      const dd = (a2 - 1) * ct * ct + 1, D = a2 / (Math.PI * dd * dd), pdf = D / 4;
      const omS = 1 / (K * pdf + 1e-6), mip = Math.max(0, 0.5 * Math.log2(omS / omP) + 1);
      const q = ((l - 1) * K + k) * 4; out[q] = L[0]; out[q + 1] = L[1]; out[q + 2] = L[2]; out[q + 3] = mip;
    }
  }
  return out;
}

/* PISO: os triângulos virados para cima (n.y > 0,99) agrupados por altura; devolve os planos (maior área primeiro) e o resto.
   pos: Float32Array (x,y,z), idx: índices (ou null) — índices de triângulo como na geometria */
export function planosDoPiso(pos, idx, tol) {
  const n = idx ? idx.length : pos.length / 3, tolY = tol || 0.01, planos = [], resto = [];
  for (let t = 0; t < n; t += 3) {
    const ia = idx ? idx[t] : t, ib = idx ? idx[t + 1] : t + 1, ic = idx ? idx[t + 2] : t + 2;
    const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2], bx = pos[ib * 3], by = pos[ib * 3 + 1], bz = pos[ib * 3 + 2], cx = pos[ic * 3], cy = pos[ic * 3 + 1], cz = pos[ic * 3 + 2];
    const e1 = [bx - ax, by - ay, bz - az], e2 = [cx - ax, cy - ay, cz - az];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0], l = Math.hypot(nx, ny, nz);
    if (l < 1e-9 || ny / l < 0.99) { resto.push(ia, ib, ic); continue; }
    const y = (ay + by + cy) / 3;
    let p = planos.find((q) => Math.abs(q.y - y) < tolY);
    if (!p) { p = { y, area: 0, tri: [], min: [Infinity, Infinity], max: [-Infinity, -Infinity] }; planos.push(p); }
    p.area += l / 2; p.tri.push(ia, ib, ic);
    p.min[0] = Math.min(p.min[0], ax, bx, cx); p.min[1] = Math.min(p.min[1], az, bz, cz); p.max[0] = Math.max(p.max[0], ax, bx, cx); p.max[1] = Math.max(p.max[1], az, bz, cz);
  }
  planos.sort((a, b) => b.area - a.area);
  return { planos, resto };
}

/* =====================================================================
 * bimmapaplanta.js — MAPA DA PLANTA no passeio do render ao vivo
 * (frente N, 20/10/2026, backlog #86; prévia `?previa=rendervivo`)
 *
 * Pedido do Rogério: "Quando eu estiver andando dentro do 3D, um mapa da planta
 * baixa com um pontinho sinalizando onde eu estou. Se eu quiser ir para um
 * ambiente, clico no mapinha e vou direto pro quarto. Quero o piso superior:
 * pelo mapa."
 *
 * O QUE FAZ
 *   · A PLANTA de cada pavimento sai da MESMA geometria do motor ao vivo, na CPU (21/10/2026; antes era um desenho na placa, e ele
 *     brigava com o passeio: "Destroyed texture" e leitura de 20–70 s): o plano de corte a 1,2 m do piso FATIA os sólidos que o cruzam
 *     (parede cheia e escura, armário cinza, vidro em linha azul) e o que está inteiro abaixo do corte é rasterizado de cima, com
 *     profundidade, em cinza pela altura (mobília) e azul (água); o piso dos ambientes vem dos contornos. Só a construção: nada de
 *     entorno, grama, árvore nem terreno. Uma vez por pavimento (guardada); nada por quadro.
 *   · O MINIMAPA (canto inferior direito, ~260 px, recolhível): nomes dos
 *     ambientes, o PONTINHO da câmera com o CONE da visão (atualizado por quadro,
 *     só quando a câmera mexe) e o seletor de pavimento. Subiu a escada: o mapa
 *     troca sozinho.
 *   · IR PARA: clicar num ambiente leva a câmera ao centro dele (olho a 1,60 m
 *     do piso) olhando para o LADO MAIS ABERTO (o maior vão livre, medido por
 *     raios sobre a própria planta desenhada); clicar num ponto sem ambiente vai
 *     até ali (o piso é achado por raio para baixo). Transição de 0,5 s com um
 *     escurecimento no meio (a câmera não atravessa a imagem à vista). Vale no
 *     modo Órbita e no Caminhar.
 *   · TECLADO / CONTROLE REMOTO: M abre e fecha o mapa; com o mapa aberto, as
 *     setas escolhem o ambiente e Enter vai até ele; PgUp/PgDn trocam de pavimento.
 *
 * DE ONDE VÊM OS AMBIENTES E PAVIMENTOS
 *   · Modelo do editor: BIM.editarEstado().estado.ambientes (calc.contorno, base,
 *     área) e os níveis da obra (Gestao._nivLer); só entra pavimento que TEM
 *     ambiente (platibanda e caixa d'água ficam de fora).
 *   · IFC: IfcBuildingStorey (BIM.pavimentos) e IfcSpace (a malha do ambiente
 *     dá o contorno: o fundo dela). Sem IfcSpace, o mapa só tem a planta
 *     desenhada e o clique no ponto; sem pavimento declarado, os pavimentos vêm
 *     das cotas dos pisos (área de face virada para cima por altura).
 *
 * ⚠ COORDENADAS: este módulo guarda tudo em coordenadas do BIM (x, y, z em metros,
 *   y para cima). As do motor ao vivo são as do BIM MENOS `origem` (a origem da
 *   extração, BimRender._ext.origem): a conversão acontece só na fronteira
 *   (câmera, planta). Ângulo de planta: direção (cos θ, sen θ) em (x, z) — o
 *   mesmo da imagem (x para a direita, z para baixo; norte do desenho = −z).
 *
 * Duas camadas: as contas puras (sem DOM, sem three) ficam em cima e têm teste em
 * node (tools/test-bimmapaplanta.mjs); a classe do mapa só desenha o canvas e liga os eventos.
 * Não usa o three nem a placa de vídeo.
 * ES module — importado pelo js/bimrendervivoui.js só quando a aba abre.
 * ===================================================================== */

export const OLHO = 1.6;        /* altura do olho sobre o piso (m) */
export const CORTE = 1.2;       /* plano de corte da planta sobre o piso (m) */
export const ALCANCE = 12;      /* até onde o raio de "lado aberto" olha (m) */
const TAU = Math.PI * 2;

/* =====================================================================
 * 1) CONTAS PURAS
 * ===================================================================== */
const num = (v, d) => { v = +v; return isFinite(v) ? v : (d === undefined ? 0 : d); };
const par = (p) => (Array.isArray(p) ? [num(p[0]), num(p[1])] : [num(p.x), num(p.z != null ? p.z : p.y)]);

/* área com sinal (m²) de um contorno [[x,z],…] */
export function areaAssinada(pts) {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}
/* centro de gravidade do contorno (média dos vértices se a área é nula) */
export function centroide(pts) {
  const A = areaAssinada(pts);
  if (Math.abs(A) < 1e-9) { let x = 0, z = 0; pts.forEach((p) => { x += p[0]; z += p[1]; }); return [x / (pts.length || 1), z / (pts.length || 1)]; }
  let cx = 0, cz = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n], k = a[0] * b[1] - b[0] * a[1]; cx += (a[0] + b[0]) * k; cz += (a[1] + b[1]) * k; }
  return [cx / (6 * A), cz / (6 * A)];
}
function dentroSimples(p, pts) {
  let d = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) d = !d;
  }
  return d;
}
/* o ponto está dentro do contorno e fora dos furos? */
export function pontoDentro(p, pts, furos) {
  if (!pts || pts.length < 3 || !dentroSimples(p, pts)) return false;
  for (const f of furos || []) if (f && f.length >= 3 && dentroSimples(p, f)) return false;
  return true;
}
function distSegmento(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz;
  let t = L > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}
/* menor distância do ponto à borda (contorno e furos) */
export function distBorda(p, pts, furos) {
  let m = Infinity;
  const volta = (L) => { for (let i = 0, n = L.length; i < n; i++) m = Math.min(m, distSegmento(p, L[i], L[(i + 1) % n])); };
  volta(pts); (furos || []).forEach((f) => { if (f && f.length >= 2) volta(f); });
  return m;
}
/* O CENTRO DO AMBIENTE onde a câmera pousa: o centro de gravidade se ele está dentro e folgado da parede; num L ou num
   U o centro de gravidade cai fora (ou colado na parede) e vale o ponto interno de maior folga (busca em grade, refinada). */
export function centroInterno(pts, furos) {
  const c = centroide(pts), ok = (p) => pontoDentro(p, pts, furos);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  pts.forEach((p) => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); });
  let passo = Math.max(maxX - minX, maxZ - minZ) / 24 || 0.1, melhor = null, folga = -1;
  const prova = (x, z) => { const p = [x, z]; if (!ok(p)) return; const d = distBorda(p, pts, furos); if (d > folga) { folga = d; melhor = p; } };
  for (let x = minX + passo / 2; x < maxX; x += passo) for (let z = minZ + passo / 2; z < maxZ; z += passo) prova(x, z);
  if (!melhor) return { p: ok(c) ? c : pts[0].slice(), folga: 0 };
  for (let it = 0; it < 4; it++) { passo /= 2; const b = melhor; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) prova(b[0] + i * passo, b[1] + j * passo); }
  if (ok(c)) { const dc = distBorda(c, pts, furos); if (dc >= 0.7 * folga) return { p: c, folga: dc }; }
  return { p: melhor, folga };
}
/* o ambiente que contém o ponto (o menor, se um cobre o outro) */
export function ambienteEm(p, ambs) {
  let r = null;
  (ambs || []).forEach((a) => { if (pontoDentro(p, a.pts, a.furos) && (!r || a.area < r.area)) r = a; });
  return r;
}
export function maiorAmbiente(ambs) { let r = null; (ambs || []).forEach((a) => { if (!r || a.area > r.area) r = a; }); return r; }

/* ângulo de planta e diferença de ângulos (−π..π) */
export const anguloDe = (dx, dz) => Math.atan2(dz, dx);
export const difAng = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const interpAng = (a, b, t) => a + difAng(a, b) * t;
export const suave = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/* O LADO MAIS ABERTO: `dists[i]` é a distância livre (m) na direção i·2π/N (0 = +x, π/2 = +z). Vale a janela de ±35° com a maior
   distância média (limitada ao alcance): um corredor comprido ou uma porta para o quintal ganham de um canto de parede.
   Empate (dentro de 1 %): o mais perto de `preferir` (rad) se veio, senão o primeiro. */
export function escolherLadoAberto(dists, o) {
  const op = o || {}, N = dists.length, cap = op.alcance || ALCANCE, W = op.janela != null ? op.janela : Math.max(1, Math.round(N * 35 / 360));
  let wsum = 0; for (let k = -W; k <= W; k++) wsum += 1 - Math.abs(k) / (W + 1);
  const sc = [];
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -W; k <= W; k++) s += (1 - Math.abs(k) / (W + 1)) * Math.min(cap, dists[((i + k) % N + N) % N]); sc.push(s / wsum); }
  let mx = -1; sc.forEach((s) => { if (s > mx) mx = s; });
  let best = -1, bd = Infinity;
  for (let i = 0; i < N; i++) {
    if (sc[i] < mx * 0.99) continue;
    const d = op.preferir != null ? Math.abs(difAng(i * TAU / N, op.preferir)) : i;
    if (d < bd) { bd = d; best = i; }
  }
  return { angulo: best * TAU / N, indice: best, folga: mx, pontuacao: sc };
}

/* QUAL PAVIMENTO: o mais alto cujo piso está até 0,35 m acima do pé de quem anda (olho − 1,5 m; escada: o mapa troca no meio) */
export function pavimentoDaAltura(pavs, yOlho, pe) {
  const yPe = yOlho - (pe == null ? 1.5 : pe);
  let r = 0;
  pavs.forEach((p, i) => { if (p.y <= yPe + 0.35) r = i; });
  return r;
}

/* vizinho na direção da seta (dx, dz) ∈ {(0,−1) cima, (0,1) baixo, (−1,0) esquerda, (1,0) direita} — o ambiente mais perto dentro de ±70° */
export function vizinho(ambs, atual, dx, dz) {
  if (!atual) return maiorAmbiente(ambs);
  let r = null, rs = Infinity;
  ambs.forEach((b) => {
    if (b === atual || b.id === atual.id) return;
    const vx = b.cx - atual.cx, vz = b.cz - atual.cz, d = Math.hypot(vx, vz); if (d < 1e-6) return;
    const cos = (vx * dx + vz * dz) / d; if (cos < 0.34) return;
    const s = d * (1 + 2 * (1 - cos)); if (s < rs) { rs = s; r = b; }
  });
  return r || atual;
}

/* "BWC PCD (acessível) - 3,47 m²" → "BWC PCD": o nome curto que cabe no mapa */
export function rotuloCurto(nome) {
  let s = String(nome == null ? '' : nome).replace(/\s*[-–—]\s*[\d.,]+\s*m\s*[²2].*$/i, '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > 22) s = s.slice(0, 21).trim() + '…';
  return s;
}

/* PROJEÇÃO: limites {x0,z0,x1,z1} (m) → imagem de no máximo maxPx no lado maior, largura e altura múltiplas de 64 (a leitura do WebGPU
   alinha a linha a 256 bytes). A escala é UMA (px/m): a planta não deforma. */
export function criarProjecao(lim, maxPx, mult) {
  mult = mult || 64;
  const w = Math.max(1, lim.x1 - lim.x0), h = Math.max(1, lim.z1 - lim.z0), esc = (maxPx || 1024) / Math.max(w, h);
  const W = Math.max(mult, Math.ceil(w * esc / mult) * mult), H = Math.max(mult, Math.ceil(h * esc / mult) * mult);
  const cx = (lim.x0 + lim.x1) / 2, cz = (lim.z0 + lim.z1) / 2, minX = cx - W / esc / 2, minZ = cz - H / esc / 2;
  return { W, H, esc, minX, minZ, maxX: minX + W / esc, maxZ: minZ + H / esc, cx, cz,
           paraPx: (x, z) => [(x - minX) * esc, (z - minZ) * esc], paraMundo: (px, py) => [minX + px / esc, minZ + py / esc] };
}

/* GRADE de ocupação a partir da planta desenhada: 1 = corte de parede (escuro). `rgba` já sem o enchimento de linha. */
export function grade(rgba, W, H, limiar) {
  const g = new Uint8Array(W * H), L = limiar || 90;
  for (let i = 0, n = W * H; i < n; i++) { const q = i * 4; g[i] = rgba[q + 3] > 0 && rgba[q] < L && rgba[q + 1] < L && rgba[q + 2] < L ? 1 : 0; }
  return { W, H, ocupado: g };
}
/* a distância livre (m) de p na direção ang, até `max` — anda sobre a grade em passos de ~0,7 px */
export function livreAte(gr, pr, p, ang, max) {
  const [x0, y0] = pr.paraPx(p[0], p[1]), c = Math.cos(ang), s = Math.sin(ang), lim = (max || ALCANCE) * pr.esc;
  for (let d = 0; d <= lim; d += 0.7) {
    const ix = Math.floor(x0 + c * d), iy = Math.floor(y0 + s * d);
    if (ix < 0 || iy < 0 || ix >= gr.W || iy >= gr.H) return max || ALCANCE;   /* saiu da planta sem bater em parede: é o lado de fora, livre */
    if (gr.ocupado[iy * gr.W + ix]) return d / pr.esc;
  }
  return max || ALCANCE;
}
export function varrerRaios(gr, pr, p, N, max) { const r = []; for (let i = 0; i < (N || 72); i++) r.push(livreAte(gr, pr, p, i * TAU / (N || 72), max)); return r; }
/* o ponto livre mais perto (m): p mesmo se a célula está livre; senão espiral até `raio` metros; null se não achou */
export function pontoLivre(gr, pr, p, raio) {
  const [x0, y0] = pr.paraPx(p[0], p[1]), R = Math.ceil((raio || 0.5) * pr.esc);
  const livre = (x, y) => x >= 0 && y >= 0 && x < gr.W && y < gr.H && !gr.ocupado[y * gr.W + x];
  const ix = Math.floor(x0), iy = Math.floor(y0);
  if (livre(ix, iy)) return p.slice();
  for (let r = 1; r <= R; r++) {
    let achei = null, md = Infinity;
    for (let i = -r; i <= r; i++) for (const [a, b] of [[i, -r], [i, r], [-r, i], [r, i]]) { if (livre(ix + a, iy + b)) { const d = a * a + b * b; if (d < md) { md = d; achei = [ix + a, iy + b]; } } }
    if (achei) return pr.paraMundo(achei[0] + 0.5, achei[1] + 0.5);
  }
  return null;
}

/* ---------------------------------------------------------------------
 * DADOS: ambientes e pavimentos (todos em coordenadas do BIM)
 * --------------------------------------------------------------------- */
/* um ambiente cru → o registro do mapa: { id, nome, pts, furos, area, cx, cz, base } */
export function normalizarAmbiente(raw) {
  const pts = (raw.pts || []).map(par), furos = (raw.furos || []).map((f) => (f || []).map(par));
  if (pts.length < 3) return null;
  let area = Math.abs(areaAssinada(pts)); furos.forEach((f) => { area -= Math.abs(areaAssinada(f)); });
  if (!(area > 0.05)) return null;
  const c = centroInterno(pts, furos);
  return { id: String(raw.id), nome: String(raw.nome || ''), rotulo: rotuloCurto(raw.nome || ''), pts, furos, area, cx: c.p[0], cz: c.p[1], folga: c.folga, base: raw.base != null ? num(raw.base, NaN) : NaN };
}

/* AMBIENTES DO EDITOR → pavimentos. `ambs` = estado.ambientes; `niveis` = [{ id, nome, elevacao }] (Gestao._nivLer). */
export function pavimentosDoEditor(ambs, niveis) {
  const L = (niveis || []).filter((n) => n && n.id != null).map((n) => ({ id: String(n.id), nome: String(n.nome || n.id), y: num(n.elevacao != null ? n.elevacao : n.y, 0) })).sort((a, b) => a.y - b.y);
  const casa = (a, id) => { const s = String(id), t = String(a); return t === s || t.split('::').pop() === s.split('::').pop(); };
  const lista = [];
  (ambs || []).forEach((a) => {
    const c = a && a.calc; if (!c || c.estado !== 'delimitado' || !c.contorno || c.contorno.length < 3) return;
    const reg = normalizarAmbiente({ id: a.id, nome: a.nome || ('Ambiente ' + (a.numero != null ? a.numero : a.id)), pts: c.contorno, furos: c.furos, base: c.base });
    if (!reg) return;
    let nv = null; const ref = a.nivelId != null ? a.nivelId : a.nivel;
    if (ref != null) nv = L.filter((n) => casa(ref, n.id))[0] || null;
    if (!nv && L.length) { nv = L[0]; const base = isFinite(reg.base) ? reg.base : 0; L.forEach((n) => { if (n.y <= base + 0.01) nv = n; }); }
    lista.push({ reg, nv, topo: num(c.topo, NaN) });
  });
  const mapa = {}, ordem = [];
  lista.forEach((x) => {
    const k = x.nv ? x.nv.id : '_unico';
    if (!mapa[k]) { mapa[k] = { id: k, nome: x.nv ? x.nv.nome : 'Pavimento', y: x.nv ? x.nv.y : (isFinite(x.reg.base) ? x.reg.base : 0), ambientes: [] }; ordem.push(mapa[k]); }
    mapa[k].ambientes.push(x.reg);
  });
  ordem.sort((a, b) => a.y - b.y);
  ordem.forEach((p, i) => {
    const prox = L.filter((n) => n.y > p.y + 0.05)[0];
    p.yTopo = prox ? prox.y : p.y + 3.2;
    p.ambientes.forEach((a) => { if (!isFinite(a.base)) a.base = p.y; });
  });
  return { pavs: ordem, fonte: 'editor' };
}

/* NÍVEIS SEM AMBIENTE QUE TÊM PISO: a Casa 487 tem Térreo e Laje (a laje de cobertura, com platibanda) e os ambientes só no térreo; a laje é um
   pavimento por onde se anda. Entra todo nível da obra cujo piso aparece na geometria (um pico de área de face virada para cima a ±0,6 m da
   cota, com pelo menos 4 % da maior) — platibanda e caixa d'água, sem piso, continuam de fora. `pisos` = pisosDaCena(). */
export function acrescentarPisos(res, niveis, pisos) {
  const L = (niveis || []).filter((n) => n && n.id != null).map((n) => ({ id: String(n.id), nome: String(n.nome || n.id), y: num(n.elevacao != null ? n.elevacao : n.y, 0) })).sort((a, b) => a.y - b.y);
  const mx = (pisos || []).reduce((m, p) => Math.max(m, p.area), 0);
  const tem = (y) => (pisos || []).some((p) => Math.abs(p.y - y) <= 0.6 && p.area >= mx * 0.04);
  const ja = (id) => res.pavs.some((p) => p.id === id);
  L.forEach((n) => { if (!ja(n.id) && tem(n.y)) res.pavs.push({ id: n.id, nome: n.nome, y: n.y, ambientes: [] }); });
  res.pavs.sort((a, b) => a.y - b.y);
  res.pavs.forEach((p, i) => {
    const prox = L.filter((n) => n.y > p.y + 0.05)[0];
    p.yTopo = prox ? prox.y : (res.pavs[i + 1] ? res.pavs[i + 1].y : p.y + 3.2);
  });
  return res;
}

/* PAVIMENTOS DO IFC: `storeys` = [{ nome, elev, y0 }] (BIM.icarPavimentos: elev = cota declarada do IfcBuildingStorey, y0 = o ponto mais baixo das peças
   dele — que pode ser a ponta da fundação, bem abaixo do piso), `espacos` = [{ id, nome, pts, ymin }] (IfcSpace), `pisos` = pisosDaCena() (opcional).
   A cota do piso do pavimento é a declarada (ou o y0, sem ela) puxada para o pico de piso mais forte a ±0,5 m; sem pico por perto, vale o
   pico forte mais baixo acima do y0. Pavimento de fundação/cobertura sem ambiente não entra (ninguém anda ali). */
export function pavimentosDoIfc(storeys, espacos, pisos) {
  const sem = /funda[cç][aã]o|estrutura do piso|cobertura|telhado|forro|barrilete|caixa d|platibanda/i, fin = (v) => v != null && isFinite(+v);
  const mx = (pisos || []).reduce((m, p) => Math.max(m, p.area), 0);
  const cotaDe = (s) => {
    let b = null;
    if (fin(s.elev)) {   /* cota declarada: o pico de piso mais forte a ±0,5 m dela */
      (pisos || []).forEach((p) => { if (Math.abs(p.y - +s.elev) <= 0.5 && (!b || p.area > b.area)) b = p; });
      return b ? b.y : +s.elev;
    }
    if (!fin(s.y0)) return null;
    /* só o y0 (o ponto mais baixo das peças, que pode ser a fundação): o pico forte mais baixo acima dele */
    (pisos || []).forEach((p) => { if (p.y >= +s.y0 - 0.1 && p.y <= +s.y0 + 3.5 && p.area >= mx * 0.4 && (!b || p.y < b.y)) b = p; });
    return b ? b.y : +s.y0;
  };
  let L = (storeys || []).map((s, i) => ({ s, y: cotaDe(s), i })).filter((x) => x.y != null)
    .map((x) => ({ id: 'ifc' + x.i, nome: String(x.s.nome || ('Pavimento ' + (x.i + 1))), y: x.y, ambientes: [] })).sort((a, b) => a.y - b.y);
  const esp = (espacos || []).map((e) => normalizarAmbiente(Object.assign({}, e, { base: e.ymin }))).filter(Boolean);
  esp.forEach((e) => {
    let p = null; L.forEach((q) => { if (q.y <= (isFinite(e.base) ? e.base : 0) + 0.6) p = q; });
    if (!p) p = L[0];
    if (p) p.ambientes.push(e);
  });
  L = L.filter((p) => p.ambientes.length || !sem.test(p.nome));
  L.forEach((p, i) => { p.yTopo = L[i + 1] ? L[i + 1].y : p.y + 3.2; p.ambientes.forEach((a) => { if (!isFinite(a.base)) a.base = p.y; }); });
  return { pavs: L, fonte: 'ifc' };
}

/* PISOS PELA GEOMETRIA (sem pavimento declarado): soma a área das faces viradas para cima por altura (faixas de 5 cm). Devolve os
   picos grandes e separados ≥ 2 m — as cotas dos pisos. `grupos` = [{ pos, idx }] do motor (y já com a origem somada: passe `dy`). */
export function pisosDaCena(grupos, dy, fracao) {
  const bins = {};
  grupos.forEach((g) => {
    const P = g.pos, I = g.idx, n = I ? I.length : P.length / 3;
    for (let t = 0; t < n; t += 3) {
      const a = (I ? I[t] : t) * 3, b = (I ? I[t + 1] : t + 1) * 3, c = (I ? I[t + 2] : t + 2) * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, L = Math.hypot(nx, ny, nz);
      if (L < 1e-9 || ny / L < 0.97) continue;
      const y = (P[a + 1] + P[b + 1] + P[c + 1]) / 3 + (dy || 0), k = Math.round(y / 0.05);
      bins[k] = (bins[k] || 0) + L / 2;
    }
  });
  const ks = Object.keys(bins).map(Number).sort((a, b) => a - b), cand = ks.map((k) => ({ y: k * 0.05, area: bins[k] }));
  /* agrupa faixas a menos de 0,3 m; cada grupo vale a soma e fica na cota da faixa mais pesada */
  const gr = [];
  cand.forEach((c) => { const u = gr[gr.length - 1]; if (u && c.y - u.fim < 0.3) { u.area += c.area; u.fim = c.y; if (c.area > u.pico) { u.pico = c.area; u.y = c.y; } } else gr.push({ y: c.y, area: c.area, pico: c.area, fim: c.y }); });
  const mx = gr.reduce((m, c) => Math.max(m, c.area), 0);
  const fortes = gr.filter((c) => c.area >= mx * (fracao || 0.2)).sort((a, b) => b.area - a.area), esc = [];
  fortes.forEach((c) => { if (!esc.some((e) => Math.abs(e.y - c.y) < 2)) esc.push({ y: c.y, area: c.area }); });
  return esc.sort((a, b) => a.y - b.y);
}
export function pavimentosPorCotas(pisos) {
  const L = pisos.map((p, i) => ({ id: 'cota' + i, nome: i === 0 ? 'Térreo' : (i + 'º pavimento'), y: p.y, ambientes: [] }));
  L.forEach((p, i) => { p.yTopo = L[i + 1] ? L[i + 1].y : p.y + 3.2; });
  return { pavs: L, fonte: 'cotas' };
}

/* o contorno do FUNDO de uma malha (IfcSpace): as faces viradas para baixo na cota mais baixa, e a borda delas (arestas que aparecem uma
   vez) encadeada em laços; vale o laço de maior área. pos: Float32Array/Array (x,y,z…), idx opcional. Devolve [[x,z],…] ou null. */
export function contornoDeMalha(pos, idx, tol) {
  const n = idx ? idx.length : pos.length / 3, T = tol || 0.02;
  let ymin = Infinity;
  for (let i = 1; i < pos.length; i += 3) if (pos[i] < ymin) ymin = pos[i];
  const arestas = {}, pontos = {};
  const chave = (x, z) => Math.round(x * 1000) + ',' + Math.round(z * 1000);
  for (let t = 0; t < n; t += 3) {
    const v = [0, 1, 2].map((k) => (idx ? idx[t + k] : t + k) * 3);
    const y = v.map((a) => pos[a + 1]); if (Math.max(y[0], y[1], y[2]) - ymin > T + 0.3 || Math.min(y[0], y[1], y[2]) - ymin > T) continue;
    const ux = pos[v[1]] - pos[v[0]], uz = pos[v[1] + 2] - pos[v[0] + 2], vx = pos[v[2]] - pos[v[0]], vz = pos[v[2] + 2] - pos[v[0] + 2];
    const ny = uz * vx - ux * vz;   /* componente y do produto vetorial (b−a)×(c−a) */
    if (Math.abs(y[0] - y[1]) > T || Math.abs(y[0] - y[2]) > T || ny > 0) continue;   /* só o triângulo plano e virado para baixo */
    const ks = v.map((a) => chave(pos[a], pos[a + 2]));
    v.forEach((a, k) => { pontos[ks[k]] = [pos[a], pos[a + 2]]; });
    for (let k = 0; k < 3; k++) {
      const a = ks[k], b = ks[(k + 1) % 3], par_ = a < b ? a + '|' + b : b + '|' + a;
      if (!arestas[par_]) arestas[par_] = { a, b, c: 0 }; arestas[par_].c++;
    }
  }
  const viz = {};
  Object.keys(arestas).forEach((k) => { const e = arestas[k]; if (e.c !== 1) return; (viz[e.a] = viz[e.a] || []).push(e.b); (viz[e.b] = viz[e.b] || []).push(e.a); });
  const usado = {}, lacos = [];
  Object.keys(viz).forEach((ini) => {
    if (usado[ini]) return;
    const laço = [ini]; usado[ini] = 1; let atual = ini, prev = null;
    for (let g = 0; g < 100000; g++) {
      const prox = (viz[atual] || []).filter((q) => q !== prev && !usado[q])[0];
      if (!prox) break;
      laço.push(prox); usado[prox] = 1; prev = atual; atual = prox;
    }
    if (laço.length >= 3) lacos.push(laço.map((k) => pontos[k]));
  });
  let best = null, ba = 0; lacos.forEach((L) => { const a = Math.abs(areaAssinada(L)); if (a > ba) { ba = a; best = L; } });
  return best;
}

/* =====================================================================
 * 1b) SÓLIDOS E CORTE (contas puras — sem three, sem DOM)
 *
 * POR QUE EXISTE (21/10/2026): a planta antes saía do plano de recorte da GPU ("o que está do outro lado do corte é a face de trás =
 * parede escura"). Isso depende do SENTIDO das faces, e o modelo vem com paredes DE DENTRO PARA FORA (volume com sinal negativo: o
 * extrator do editor monta o sólido com a ordem dos vértices invertida) e com mobília de espessura fina (tampo de 4 cm) que perdia a
 * disputa de profundidade para o próprio fundo. Resultado medido: paredes viravam um contorno branco fino e a mobília ficava preta.
 * A saída é o que a planta de verdade faz: CORTAR. Os triângulos são agrupados em SÓLIDOS (pela aresta que dividem), e o plano de
 * corte atravessa os sólidos que cruzam a altura do corte: a interseção vira polígono de planta (parede = cheia e escura). Nada aqui
 * depende do sentido das faces. O que está inteiro abaixo do corte (mobília, água) a GPU desenha por cima, pela altura; o que está
 * inteiro acima (forro, telhado) nem entra.
 * ===================================================================== */

/* tabela de pontos soldados (1 mm): três inteiros → um número de ponto. Endereçamento aberto, sem string (milhões de vértices). */
function tabelaPontos(n) {
  let cap = 16; while (cap < n * 2) cap <<= 1;
  return { m: cap - 1, x: new Int32Array(cap), y: new Int32Array(cap), z: new Int32Array(cap), v: new Int32Array(cap).fill(-1), n: 0 };
}
function idDoPonto(t, ix, iy, iz) {
  let h = (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) & t.m;
  for (;;) {
    const v = t.v[h];
    if (v < 0) { t.x[h] = ix; t.y[h] = iy; t.z[h] = iz; t.v[h] = t.n; return t.n++; }
    if (t.x[h] === ix && t.y[h] === iy && t.z[h] === iz) return v;
    h = (h + 1) & t.m;
  }
}

/* SÓLIDOS: agrupa os triângulos que dividem uma aresta (pontos soldados a 1 mm). pos = x,y,z…; idx opcional (3 por triângulo).
   Devolve { nTri, comp: Int32Array(nTri) (0..nComp−1), nComp, topo: Float32Array, base: Float32Array } — topo/base = menor e maior y do sólido. */
/* ⚠ AS CONTAS LONGAS SÃO GERADORES (passos…): o mapa as roda em fatias de poucos ms entre os quadros do passeio (MapaPlanta._rodar). Uma fatia
   de 30–70 ms na thread principal, com o motor desenhando, faz o motor perder a textura de 816×370 ("Destroyed texture") — ver MapaPlanta.iniciar.
   `lote` = quantas voltas por fatia (Infinity = de uma vez); os nomes sem "passos" rodam tudo de uma vez (testes, roteiro sem navegador). */
function correr(g) { let r; do { r = g.next(); } while (!r.done); return r.value; }
export function* passosAnalisarSolidos(pos, idx, lote) {
  const L = lote || Infinity; let q = 0;
  const nTri = Math.floor((idx ? idx.length : pos.length / 3) / 3);
  const tp = tabelaPontos(nTri * 3), w = new Int32Array(nTri * 3);
  for (let k = 0; k < nTri * 3; k++) {
    const i = (idx ? idx[k] : k) * 3;
    w[k] = idDoPonto(tp, Math.round(pos[i] * 1000), Math.round(pos[i + 1] * 1000), Math.round(pos[i + 2] * 1000));
    if (++q >= L) { q = 0; yield; }
  }
  const pai = new Int32Array(nTri); for (let t = 0; t < nTri; t++) pai[t] = t;
  const raiz = (a) => { while (pai[a] !== a) { pai[a] = pai[pai[a]]; a = pai[a]; } return a; };
  const unir = (a, b) => { a = raiz(a); b = raiz(b); if (a !== b) pai[a] = b; };
  /* arestas: chave numérica (menor·N + maior), a primeira vez guarda o triângulo; as outras unem */
  const N = tp.n + 1; let cap = 16; while (cap < nTri * 6) cap <<= 1;
  const ck = new Float64Array(cap).fill(-1), cv = new Int32Array(cap), mk = cap - 1;
  for (let t = 0; t < nTri; t++) {
    for (let e = 0; e < 3; e++) {
      const a = w[t * 3 + e], b = w[t * 3 + (e + 1) % 3]; if (a === b) continue;
      const lo = a < b ? a : b, hi = a < b ? b : a, key = lo * N + hi;
      let h = (Math.imul(lo, 73856093) ^ Math.imul(hi, 19349663)) & mk;
      for (;;) {
        if (ck[h] < 0) { ck[h] = key; cv[h] = t; break; }
        if (ck[h] === key) { unir(t, cv[h]); break; }
        h = (h + 1) & mk;
      }
    }
    if (++q >= L) { q = 0; yield; }
  }
  const comp = new Int32Array(nTri), idDe = new Int32Array(nTri).fill(-1); let nComp = 0;
  for (let t = 0; t < nTri; t++) { const r = raiz(t); if (idDe[r] < 0) idDe[r] = nComp++; comp[t] = idDe[r]; if (++q >= L) { q = 0; yield; } }
  const topo = new Float32Array(nComp).fill(-Infinity), base = new Float32Array(nComp).fill(Infinity);
  for (let t = 0; t < nTri; t++) {
    const c = comp[t];
    for (let e = 0; e < 3; e++) { const y = pos[(idx ? idx[t * 3 + e] : t * 3 + e) * 3 + 1]; if (y > topo[c]) topo[c] = y; if (y < base[c]) base[c] = y; }
    if (++q >= L) { q = 0; yield; }
  }
  return { nTri, comp, nComp, topo, base };
}
export function analisarSolidos(pos, idx) { return correr(passosAnalisarSolidos(pos, idx)); }

/* O CORTE no plano y = yCorte: os segmentos x–z da interseção com os triângulos dos sólidos que CRUZAM a altura (base < yCorte < topo),
   encadeados em laços fechados (parede, pilar) e linhas abertas (vidro, folha fina). O encadeamento é de TODA a malha, não de cada sólido:
   uma parede em pedaços (a lateral e a ponta não dividem aresta inteira) só fecha o laço juntando os pedaços. Cada laço leva `topo`
   (o maior topo dos sólidos que o formam — separa parede de armário). Devolve { lacos: [{ pts:[[x,z],…], topo }], abertas: [...] }. */
export function* passosCortarSolidos(pos, idx, an, yCorte, lote) {
  const L = lote || Infinity; let q = 0;
  const yc = yCorte + 1e-5, segs = [], topos = [], grupo = [];
  const ponto = (i, j) => {   /* a interseção da aresta i–j com o plano, calculada sempre do ponto mais baixo para o mais alto (mesmo número nos dois triângulos que dividem a aresta) */
    let a = i * 3, b = j * 3;
    if (pos[a + 1] > pos[b + 1] || (pos[a + 1] === pos[b + 1] && (pos[a] > pos[b] || (pos[a] === pos[b] && pos[a + 2] > pos[b + 2])))) { const q = a; a = b; b = q; }
    const t = (yc - pos[a + 1]) / (pos[b + 1] - pos[a + 1]);
    return [pos[a] + (pos[b] - pos[a]) * t, pos[a + 2] + (pos[b + 2] - pos[a + 2]) * t];
  };
  for (let t = 0; t < an.nTri; t++) {
    if (++q >= L) { q = 0; yield; }
    const c = an.comp[t]; if (!(an.base[c] < yc && an.topo[c] > yc)) continue;
    const v = [idx ? idx[t * 3] : t * 3, idx ? idx[t * 3 + 1] : t * 3 + 1, idx ? idx[t * 3 + 2] : t * 3 + 2], s = [];
    for (let e = 0; e < 3; e++) { const i = v[e], j = v[(e + 1) % 3]; if ((pos[i * 3 + 1] - yc) * (pos[j * 3 + 1] - yc) < 0) s.push(ponto(i, j)); }
    if (s.length !== 2) continue;
    if (Math.abs(s[0][0] - s[1][0]) + Math.abs(s[0][1] - s[1][1]) < 1e-7) continue;
    segs.push(s); topos.push(an.topo[c]); grupo.push(c);
  }
  const e = yield* passosEncadear(segs, grupo, L), com = (L) => L.map((l) => ({ pts: l, topo: l.ids.reduce((m, i) => Math.max(m, topos[i]), -Infinity) }));
  return { lacos: com(e.lacos), abertas: com(e.abertas) };
}
export function cortarSolidos(pos, idx, an, yCorte) { return correr(passosCortarSolidos(pos, idx, an, yCorte)); }

/* segmentos soltos [[p,q],…] → polilinhas: fechadas (o fim volta ao começo) ou abertas. Cada polilinha leva `.ids` (os segmentos que a formam). */
export function* passosEncadear(segs, grupo, lote) {
  const L = lote || Infinity; let q = 0;
  const K = (p) => Math.round(p[0] * 10000) + ',' + Math.round(p[1] * 10000), toca = new Map();
  for (let i = 0; i < segs.length; i++) { const s = segs[i]; [K(s[0]), K(s[1])].forEach((k) => { let l = toca.get(k); if (!l) toca.set(k, (l = [])); l.push(i); }); if (++q >= L) { q = 0; yield; } }
  const usado = new Uint8Array(segs.length), lacos = [], abertas = [];
  /* no ponto em que dois sólidos se tocam (canto de parede), o laço continua no MESMO sólido; só passa a outro se o sólido acabou ali (a
     parede em pedaços que só fecha o laço juntos) — senão o laço de uma parede se emenda no da vizinha e vira um oito */
  const proximo = (p, de) => {
    const l = toca.get(K(p)) || []; let outro = -1;
    for (const i of l) { if (usado[i]) continue; if (!grupo || de == null || grupo[i] === grupo[de]) return i; if (outro < 0) outro = i; }
    return outro;
  };
  for (let i = 0; i < segs.length; i++) {
    if (usado[i]) continue;
    usado[i] = 1; const linha = [segs[i][0], segs[i][1]], ids = [i];
    for (let g = 0; g < 1e6; g++) {   /* para a frente */
      if (linha.length > 2 && K(linha[0]) === K(linha[linha.length - 1])) break;   /* voltou ao começo: o laço fechou, não emenda no vizinho */
      const j = proximo(linha[linha.length - 1], ids[ids.length - 1]); if (j < 0) break;
      usado[j] = 1; ids.push(j); const s = segs[j]; linha.push(K(s[0]) === K(linha[linha.length - 1]) ? s[1] : s[0]);
    }
    for (let g = 0; g < 1e6; g++) {   /* e para trás, se não fechou */
      if (K(linha[0]) === K(linha[linha.length - 1])) break;
      const j = proximo(linha[0], ids[ids.length - 1]); if (j < 0) break;
      usado[j] = 1; ids.push(j); const s = segs[j]; linha.unshift(K(s[0]) === K(linha[0]) ? s[1] : s[0]);
    }
    if (K(linha[0]) === K(linha[linha.length - 1]) && linha.length >= 4) { linha.pop(); linha.ids = ids; lacos.push(linha); } else { linha.ids = ids; abertas.push(linha); }
    q += ids.length; if (q >= L) { q = 0; yield; }
  }
  return { lacos, abertas };
}
export function encadear(segs, grupo) { return correr(passosEncadear(segs, grupo)); }

/* LAÇOS → o que se pinta: todos com a MESMA orientação (anti-horária), exceto os BURACOS (vão de uma parede em anel, poço, pilar oco), que
   ficam no sentido contrário. Buraco = laço inteiro dentro de um número ÍMPAR de laços maiores. Assim a regra "não-zero" do desenho faz a
   UNIÃO de sólidos que se sobrepõem (canto de parede, T) e ainda tira o vão — o par-ímpar puro apagaria o canto onde dois sólidos se cruzam.
   lacos = [{ pts, topo }]; devolve [{ pts, buraco, area, topo }]. */
function perimetro(pts) { let s = 0; for (let i = 0, n = pts.length; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; }
/* a ESPESSURA de uma seção cheia (sem furo): 2·área/perímetro — 0,15 m numa parede de 15 cm, 0,45 m num guarda-roupa de 60 × 180.
   Parede e pilar são finos; peça de mobília que sobe até o forro (guarda-roupa, coluna de armário) é bojuda: cinza, não parede. */
export const espessuraDoLaco = (l) => (l.perim > 0 ? 2 * l.area / l.perim : 0);
export function* passosOrganizarLacos(lacos, lote) {
  const passo = lote || Infinity; let q = 0;
  const L = lacos.map((l) => {
    const A = areaAssinada(l.pts); let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    l.pts.forEach((p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; });
    return { pts: A < 0 ? l.pts.slice().reverse() : l.pts, area: Math.abs(A), topo: l.topo, x0, z0, x1, z1, buraco: false };
  }).filter((l) => l.area > 1e-8);
  const dentro = (a, b) => {   /* o laço a está inteiro dentro do laço b? */
    if (!(b.area > a.area * 1.0001) || a.x0 < b.x0 - 1e-6 || a.x1 > b.x1 + 1e-6 || a.z0 < b.z0 - 1e-6 || a.z1 > b.z1 + 1e-6) return false;
    for (const p of a.pts) if (!(distBorda(p, b.pts) < 0.003 || dentroSimples(p, b.pts))) return false;   /* ponto na borda (T de parede) conta como dentro */
    return true;
  };
  for (const a of L) { let n = 0, pai = null; L.forEach((b) => { if (b !== a && dentro(a, b)) { n++; if (!pai || b.area < pai.area) pai = b; } }); a.buraco = (n % 2) === 1; a.pai = pai; if (a.buraco) a.pts = a.pts.slice().reverse(); if (++q >= passo) { q = 0; yield; } }
  L.forEach((a) => { a.furos = L.filter((b) => b.buraco && b.pai === a).length; a.perim = perimetro(a.pts); });
  return L;
}
export function organizarLacos(lacos) { return correr(passosOrganizarLacos(lacos)); }

/* os triângulos (números) dos sólidos INTEIROS abaixo do corte: o que se desenha por cima do piso. Os que cruzam o corte viram seção
   (cortarSolidos); os inteiros acima (forro, telhado) não entram. */
export function triangulosAbaixoDoCorte(an, yCorte) {
  const r = [];
  for (let t = 0; t < an.nTri; t++) if (an.topo[an.comp[t]] <= yCorte) r.push(t);
  return Int32Array.from(r);
}

/* A PALETA de uma classe de material, por altura sobre o piso do pavimento (faixas de 1 cm, de −4 a +3 m): quanto a altura é visível e a
   cor. Mobília: do cinza claro (tampo baixo) ao cinza médio (alto). Ao nível do piso (−0,6 a +0,06 m): só quando o piso vem desta camada (sem
   ambientes). Bem abaixo do piso: o pavimento de baixo visto por um vão, só nos pavimentos de cima. `cores` = a tabela COR (0–1). */
const FAIXA = { min: -4, max: 3, passo: 0.01 };
export function paletaDaPlanta(cls, o, cores) {
  const N = Math.round((FAIXA.max - FAIXA.min) / FAIXA.passo) + 1, vis = new Uint8Array(N), cor = new Uint32Array(N), op = o || {};
  const emp = (c) => (Math.round(c[0] * 255) | (Math.round(c[1] * 255) << 8) | (Math.round(c[2] * 255) << 16) | (255 << 24)) >>> 0;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let i = 0; i < N; i++) {
    const alt = FAIXA.min + i * FAIXA.passo; let c = null;
    if (cls === 'geral') {
      if (alt > 0.06) c = mix(cores.objBaixo, cores.objAlto, suave((alt - 0.06) / (1.15 - 0.06)));
      else if (alt < -0.6) { if (op.contexto) c = cores.fora; } else if (op.piso) c = cores.piso;
    } else if (alt > -0.6) c = cls === 'agua' ? cores.agua : (cls === 'vidro' ? cores.vidro : cores.calcada);
    if (c) { vis[i] = 1; cor[i] = emp(c); }
  }
  const acum = new Int32Array(N + 1); for (let i = 0; i < N; i++) acum[i + 1] = acum[i] + vis[i];
  return { vis, cor, acum, N };
}

/* RASTERIZAÇÃO DE CIMA, com profundidade (o que está mais alto vence), na CPU: nada de GPU, de textura nem de leitura assíncrona — a
   planta sai em poucas dezenas de ms, igual em qualquer máquina, e não encosta no desenho do passeio. Não depende do sentido das faces
   (vence a altura). `fontes` = [{ pos, idx, tris, pal, ox, oy, oz, pisoY }] (x,z em metros do BIM = pos + origem; altura sobre o piso =
   y + oy − pisoY). ss = super-amostragem (2 = 2 × 2 por pixel, borda suave). Devolve RGBA (cor direta; alfa = cobertura). */
export function* passosRasterizarTopo(W, H, esc, minX, minZ, fontes, ss, lote) {
  const L = lote || Infinity; let q = 0;
  ss = ss || 1; const w = W * ss, h = H * ss, e = esc * ss, z = new Float32Array(w * h).fill(-Infinity), col = new Uint32Array(w * h);
  for (const f of fontes) {
    const { pos, idx, tris, pal, ox, oy, oz, pisoY } = f, n = tris ? tris.length : Math.floor((idx ? idx.length : pos.length / 3) / 3), N = pal.N;
    for (let qi = 0; qi < n; qi++) {
      const t = tris ? tris[qi] : qi, a = (idx ? idx[t * 3] : t * 3) * 3, b = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3, c = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3;
      const h0 = pos[a + 1] + oy - pisoY, h1 = pos[b + 1] + oy - pisoY, h2 = pos[c + 1] + oy - pisoY;
      const lo = Math.min(h0, h1, h2), hi = Math.max(h0, h1, h2);
      const i0 = Math.max(0, Math.floor((lo - FAIXA.min) / FAIXA.passo)), i1 = Math.min(N - 1, Math.ceil((hi - FAIXA.min) / FAIXA.passo));
      if (i1 < 0 || i0 > N - 1 || pal.acum[i1 + 1] - pal.acum[i0] <= 0) continue;   /* nenhuma altura deste triângulo é visível */
      const x0 = (pos[a] + ox - minX) * e, y0 = (pos[a + 2] + oz - minZ) * e, x1 = (pos[b] + ox - minX) * e, y1 = (pos[b + 2] + oz - minZ) * e, x2 = (pos[c] + ox - minX) * e, y2 = (pos[c + 2] + oz - minZ) * e;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(area) < 1e-9) continue;   /* de pé (vertical): de cima não tem área */
      const bx0 = Math.max(0, Math.floor(Math.min(x0, x1, x2))), bx1 = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
      const by0 = Math.max(0, Math.floor(Math.min(y0, y1, y2))), by1 = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2))), inv = 1 / area;
      for (let py = by0; py <= by1; py++) {
        if ((q += bx1 - bx0 + 1) >= L) { q = 0; yield; }
        const cy = py + 0.5;
        for (let px = bx0; px <= bx1; px++) {
          const cx = px + 0.5, w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) * inv; if (w0 < -1e-6) continue;
          const w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) * inv; if (w1 < -1e-6) continue;
          const w2 = 1 - w0 - w1; if (w2 < -1e-6) continue;
          const alt = w0 * h0 + w1 * h1 + w2 * h2, bin = Math.floor((alt - FAIXA.min) / FAIXA.passo + 0.5);
          if (bin < 0 || bin >= N || !pal.vis[bin]) continue;
          const k = py * w + px; if (alt <= z[k]) continue;
          z[k] = alt; col[k] = pal.cor[bin];
        }
      }
    }
  }
  const rgba = new Uint8ClampedArray(W * H * 4), s2 = ss * ss;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x === 0 && ((q += W * s2) >= L)) { q = 0; yield; }
    let r = 0, g = 0, bl = 0, n = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) { const v = col[(y * ss + j) * w + x * ss + i]; if (v) { r += v & 255; g += (v >>> 8) & 255; bl += (v >>> 16) & 255; n++; } }
    if (n) { const q = (y * W + x) * 4; rgba[q] = r / n; rgba[q + 1] = g / n; rgba[q + 2] = bl / n; rgba[q + 3] = 255 * n / s2; }
  }
  return rgba;
}
export function rasterizarTopo(W, H, esc, minX, minZ, fontes, ss) { return correr(passosRasterizarTopo(W, H, esc, minX, minZ, fontes, ss)); }

/* a cota do piso sob (x, z) (m, BIM): a superfície mais alta, de face (quase) horizontal, entre yMin e yMax. null se não há. */
export function alturaDoPiso(fontes, x, z, yMin, yMax) {
  let melhor = null;
  fontes.forEach((f) => {
    const { pos, idx, tris, ox, oy, oz } = f, n = tris ? tris.length : Math.floor((idx ? idx.length : pos.length / 3) / 3);
    for (let q = 0; q < n; q++) {
      const t = tris ? tris[q] : q, a = (idx ? idx[t * 3] : t * 3) * 3, b = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3, c = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3;
      const x0 = pos[a] + ox, z0 = pos[a + 2] + oz, x1 = pos[b] + ox, z1 = pos[b + 2] + oz, x2 = pos[c] + ox, z2 = pos[c + 2] + oz;
      if (x < Math.min(x0, x1, x2) || x > Math.max(x0, x1, x2) || z < Math.min(z0, z1, z2) || z > Math.max(z0, z1, z2)) continue;
      const area = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0); if (Math.abs(area) < 1e-9) continue;
      const w0 = ((x1 - x) * (z2 - z) - (x2 - x) * (z1 - z)) / area, w1 = ((x2 - x) * (z0 - z) - (x0 - x) * (z2 - z)) / area, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, L = Math.hypot(nx, ny, nz); if (L < 1e-12 || Math.abs(ny) / L < 0.5) continue;   /* só face (quase) horizontal */
      const y = w0 * (pos[a + 1] + oy) + w1 * (pos[b + 1] + oy) + w2 * (pos[c + 1] + oy);
      if (y >= yMin && y <= yMax && (melhor === null || y > melhor)) melhor = y;
    }
  });
  return melhor;
}

/* =====================================================================
 * 2) COLETA DE DADOS NO NAVEGADOR (BIM, Gestao, BimRender)
 * ===================================================================== */
const EXTERIOR = /^(grama|terra|brita|asfalto|piso_intertravado|agua)$/;
function pisosDoMotor(vivo, or, fracao) {
  const gs = [];
  vivo.scene.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.position && !malhaDoEntorno(o) && !(o.material && o.material.userData && EXTERIOR.test(o.material.userData.id || ''))) gs.push({ pos: o.geometry.attributes.position.array, idx: o.geometry.index ? o.geometry.index.array : null }); });
  return pisosDaCena(gs, or[1], fracao);
}
export function coletarDados(G, vivo, origem) {
  const or = origem || [0, 0, 0];
  /* 1) o editor do OrçaPRO */
  try {
    const E = G.BIM && G.BIM.editarEstado && G.BIM.editarEstado(), st = E && E.estado;
    if (st && st.ambientes && st.ambientes.length) {
      let niveis = []; try { niveis = G.Niveis && G.Gestao && G.Gestao._nivLer ? G.Niveis.listar(G.Gestao._nivLer()) : (G.Gestao && G.Gestao._nivLer ? G.Gestao._nivLer() : []); } catch (e) { niveis = []; }
      const r = pavimentosDoEditor(st.ambientes, niveis);
      if (r.pavs.length) {
        /* níveis sem ambiente mas com piso (a laje da Casa 487) também são pavimentos */
        try {
          if (vivo && vivo.scene) {
            const pisos = pisosDoMotor(vivo, or, 0.04);
            r.diag = { pisos: pisos.map((q) => [+q.y.toFixed(2), Math.round(q.area)]), niveis: (niveis || []).map((n) => [String(n.id), n.elevacao]) };
            if ((niveis || []).length > r.pavs.length) acrescentarPisos(r, niveis, pisos);
          }
        } catch (e) { /* fica só com os de ambiente */ }
        return r;
      }
    }
  } catch (e) { /* cai no IFC */ }
  /* 2) o IFC: pavimentos declarados + IfcSpace */
  try {
    const F = G.BIM && G.BIM.renderFonte && G.BIM.renderFonte(), storeys = (G.BIM && (G.BIM.icarPavimentos ? G.BIM.icarPavimentos() : G.BIM.pavimentos)) || [], espacos = [];
    if (F) F.modelos.forEach((mo) => {
      if (!mo.grupo || mo.visivel === false) return;
      const porId = {}; (mo.elementos || []).forEach((e) => { porId[e.id] = e; });
      mo.grupo.children.forEach((m) => {
        if (!m.isMesh || !m.userData || String(m.userData.tipo || '').toUpperCase() !== 'IFCSPACE' || !m.geometry || !m.geometry.attributes.position) return;
        const g = m.geometry, pa = g.attributes.position, E = m.matrixWorld.elements, w = new Float64Array(pa.count * 3);
        for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); w[i * 3] = E[0] * x + E[4] * y + E[8] * z + E[12]; w[i * 3 + 1] = E[1] * x + E[5] * y + E[9] * z + E[13]; w[i * 3 + 2] = E[2] * x + E[6] * y + E[10] * z + E[14]; }
        const idx = g.index ? g.index.array : null, pts = contornoDeMalha(w, idx);
        let ymin = Infinity; for (let i = 1; i < w.length; i += 3) if (w[i] < ymin) ymin = w[i];
        const el = porId[m.userData.expressID] || {};
        if (pts) espacos.push({ id: 'sp' + mo.mid + ':' + m.userData.expressID, nome: el.nome || el.name || ('Ambiente ' + (espacos.length + 1)), pts, ymin });
      });
    });
    let pisos = []; try { if (vivo && vivo.scene) pisos = pisosDoMotor(vivo, or); } catch (e) { pisos = []; }
    const r = pavimentosDoIfc(storeys, espacos, pisos);
    if (r.pavs.length) return r;
  } catch (e) { /* cai nas cotas */ }
  /* 3) as cotas dos pisos da própria cena */
  try {
    const pisos = pisosDoMotor(vivo, or);
    if (pisos.length) return pavimentosPorCotas(pisos);
  } catch (e) { /* sem pavimentos */ }
  return { pavs: [{ id: 'unico', nome: 'Pavimento', y: 0, yTopo: 3.2, ambientes: [] }], fonte: 'nenhuma' };
}

/* =====================================================================
 * 3) O MAPA (DOM + planta pelo motor)
 * ===================================================================== */
/* AS CORES DA PLANTA (r, g, b de 0 a 1). Parede é o que há de mais forte; piso claro; mobília cinza médio-claro que se lê sem competir com a
   parede; água azul. A parede tem de ficar abaixo de 90 em cada canal: a grade de "o que é parede" (raios do lado aberto) lê o escuro. */
export const COR = {
  fundo: [0.875, 0.898, 0.925],       /* fora da construção */
  piso: [0.985, 0.98, 0.965],         /* piso dos ambientes */
  fora: [0.84, 0.865, 0.9],           /* o pavimento de baixo, visto por um vão */
  calcada: [0.925, 0.932, 0.945],     /* piso externo (calçada, brita, intertravado) */
  objBaixo: [0.80, 0.83, 0.865],      /* mobília: o tampo mais baixo… */
  objAlto: [0.60, 0.64, 0.70],        /* …até o mais alto abaixo do corte (e as peças altas cortadas, como armário) */
  parede: [0.114, 0.141, 0.188],      /* a seção da parede */
  agua: [0.47, 0.73, 0.93],
  vidro: [0.42, 0.70, 0.88], vidroLinha: [0.33, 0.62, 0.85]
};
const LOTE_ANALISE = 6000, LOTE_CORTE = 8000, LOTE_RASTER = 60000, LOTE_ORGANIZAR = 2;   /* voltas por passo: ~1–3 ms cada */
const FATIA_MS = 6;                  /* a fatia de trabalho do mapa entre dois quadros do passeio (ms) */
const SUPERAMOSTRA = 2;               /* a planta é rasterizada em 2 × 2 por pixel (borda suave) */
export const ESPESSURA_PECA = 0.4;   /* seção cheia mais grossa que isto (m) não é parede */
export const ALTURA_PAREDE = 2.3;     /* o que cruza o corte e passa disto (m acima do piso) é parede/pilar; abaixo (porta 2,1; armário) é peça */
const css3 = (c) => 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')';

/* a classe do material (id do motor) no desenho da planta; null = não entra (vegetação, telha, grama e terra: o mapa é só da construção) */
export function classeDaMalha(id) {
  id = String(id || '');
  if (/^(folhagem|flor|tronco|telha_|grama|terra)/.test(id)) return null;
  if (/^(brita|asfalto|piso_intertravado)$/.test(id)) return 'exterior';
  if (id === 'agua') return 'agua';
  if (/^(vidro_|policarbonato)/.test(id)) return 'vidro';
  return 'geral';
}
/* ⚠ O ENTORNO NÃO ENTRA (causa dos "estilhaços", 21/10/2026): a grama 3D e as árvores (js/bimentorno.js) são malhas MARCADAS com
   userData.entorno que ganham a posição no vértice (positionNode: a grade de lâminas e o vento) ou a matriz de cada instância
   (InstancedMesh). Desenhadas com um material comum, sem esse nó nem a matriz, as lâminas e as folhas ficam na geometria crua:
   triângulos esticados cruzando a planta. Também não entram na busca dos pisos (as copas das árvores viravam "pisos" a 66 m). */
export function malhaDoEntorno(o) { return !!(o && (o.isInstancedMesh || o.isPoints || o.isLine || (o.userData && (o.userData.entorno || o.userData.verso /* [frente E2] a cópia do verso (js/bimverso.js) não é construção nova */)))); }

const ACENTO = '#ff9f1c', PONTO = '#ff3b30';
function css(el, s) { el.style.cssText = s; return el; }

export class MapaPlanta {
  /* o = { vivo, tela, global, origem, aberto?, aoPref?(obj) } */
  constructor(o) {
    this.o = o; this.vivo = o.vivo; this.tela = o.tela; this.G = o.global || (typeof window !== 'undefined' ? window : {});
    this.origem = o.origem || [0, 0, 0];
    this.aberto = o.aberto !== false; this.pav = null; this.sel = null; this.hover = null;
    this._cache = {}; this._ev = []; this._vivo = true; this._yaw = 0; this._ult = ''; this._voando = null; this._ajustes = 0;
    this.larg = o.largura || 260;
  }

  /* ----------------------------------------------------------- partida */
  async iniciar() {
    const v = this.vivo;
    /* ⚠ O MAPA NÃO COMPETE COM A ABERTURA DO PASSEIO (21/10/2026): no 1º quadro o motor compila pipelines de forma assíncrona e troca a
       textura de 816×370 a cada quadro (cópia do quadro para o vidro). Se a thread principal fica presa ~200 ms nessa hora, a compilação
       chega depois de a textura ser trocada e a placa recusa o envio ("Destroyed texture 816x370 RGBA16Float", ~20 quadros). Medido: abrir
       a aba sem o mapa = 0 erro; com o mapa trabalhando em bloco = o erro de sempre. Então: espera o passeio assentar (40 quadros) e faz o
       trabalho em fatias de poucos ms, soltando a thread entre elas. */
    this._marca('iniciar'); await this._assentar(); this._marca('assentou');
    if (!this._vivo) return this;
    const d = this.dados = coletarDados(this.G, v, this.origem);
    this.pavs = d.pavs; this.fonte = d.fonte;
    await this._cede();
    this.lim = await this._rodar(this._passosLimites()); if (!this._vivo) return this;
    this.proj = criarProjecao(this.lim, 1024, 64);
    await this._cede(); this._montarDom();
    await this._cede(); this._ligar();
    const cam = this._cameraBim();
    const i0 = pavimentoDaAltura(this.pavs, cam.y);
    this._marca('dom'); await this._mostrar(this.pavs[i0]); this._marca('planta');
    if (!this._vivo) return this;
    this.sel = (ambienteEm([cam.x, cam.z], this.pav.ambientes) || maiorAmbiente(this.pav.ambientes) || null);
    this._pintar(true);
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
    return this;
  }
  /* roda um gerador em fatias de ~6 ms, soltando a thread até o PRÓXIMO QUADRO entre elas: o passeio desenha entre as fatias */
  async _rodar(gen, orcamentoMs) {
    const orc = orcamentoMs || FATIA_MS;
    for (;;) {
      const t0 = performance.now(); let r;
      do { r = gen.next(); if (r.done) return r.value; } while (performance.now() - t0 < orc);
      if (!this._vivo) return null;
      await this._quadro();
    }
  }
  /* até o próximo quadro (ou 80 ms, se a aba não desenha) */
  _quadro() { return new Promise((r) => { let ok = false; const f = () => { if (!ok) { ok = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 80); }); }
  /* marcas de tempo do trabalho do mapa (Date.now), para casar com o que acontece no motor — diagnóstico (estado().marcas) */
  _marca(n) { (this._marcas = this._marcas || []).push([n, Date.now(), (this.vivo && this.vivo._quadros) || 0]); }
  /* solta a thread por ~2 quadros: o motor ao vivo desenha entre as fatias do trabalho do mapa */
  _cede() { return new Promise((r) => setTimeout(r, 30)); }
  /* espera o passeio assentar: 40 quadros desenhados desde agora (ou 4 s, se o motor descansa) */
  _assentar() {
    const v = this.vivo, q0 = v._quadros || 0, t0 = performance.now();
    return new Promise((ok) => {
      const f = () => { if (!this._vivo || (v._quadros || 0) - q0 >= 40 || performance.now() - t0 > 4000) return ok(); setTimeout(f, 50); };
      f();
    });
  }

  /* os limites da planta (m, BIM): os contornos dos ambientes de TODOS os pavimentos (a imagem não pula ao trocar) + margem */
  *_passosLimites() {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const pts = [];
    this.pavs.forEach((p) => p.ambientes.forEach((a) => a.pts.forEach((q) => pts.push(q))));
    if (pts.length) {
      pts.forEach((q) => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); });
      const m = Math.max(1.5, 0.06 * Math.max(x1 - x0, z1 - z0));
      return { x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m };
    }
    /* sem ambiente (IFC sem IfcSpace): a caixa do que a seção do corte acha — parede, pilar, peça alta, vidro —, que é o prédio; o piso e a
       calçada de 100 m e os triângulos soltos longe dele não contam (esticavam a planta e o prédio virava um pontinho; medido no Quiosque) */
    const or = this.origem; yield* this._passosPreparar();
    for (const pav of this.pavs) {
      const c = yield* this._passosCortes(pav), ponto = (p) => { const X = p[0] + or[0], Z = p[1] + or[2]; x0 = Math.min(x0, X); x1 = Math.max(x1, X); z0 = Math.min(z0, Z); z1 = Math.max(z1, Z); };
      c.parede.concat(c.alto).forEach((g) => g.forEach((l) => l.forEach(ponto))); c.vidro.forEach((l) => l.forEach(ponto)); c.abertas.forEach((a) => a.pts.forEach(ponto));
    }
    if (!isFinite(x0)) {   /* nada cortado: a caixa das malhas pequenas do prédio */
      this.vivo.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry || malhaDoEntorno(o)) return;
        const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox; if (!b || Math.max(b.max.x - b.min.x, b.max.z - b.min.z) > 70) return;
        x0 = Math.min(x0, b.min.x + or[0]); x1 = Math.max(x1, b.max.x + or[0]); z0 = Math.min(z0, b.min.z + or[2]); z1 = Math.max(z1, b.max.z + or[2]);
      });
    }
    if (!isFinite(x0)) { const c = this.vivo.caixa; x0 = c.min.x + or[0]; x1 = c.max.x + or[0]; z0 = c.min.z + or[2]; z1 = c.max.z + or[2]; }
    const m = Math.max(1.5, 0.06 * Math.max(x1 - x0, z1 - z0));
    return { x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m };
  }
  _limites() { return correr(this._passosLimites()); }

  _cameraBim() { const c = this.vivo.camera.position, or = this.origem; return { x: c.x + or[0], y: c.y + or[1], z: c.z + or[2] }; }
  _yawAtual() {
    const v = this.vivo, c = v.camera.position, a = v.nav.alvo, dx = a.x - c.x, dz = a.z - c.z;
    if (Math.hypot(dx, dz) > 1e-3) this._yaw = anguloDe(dx, dz);
    return this._yaw;
  }

  /* ----------------------------------------------------------- DOM */
  _montarDom() {
    const dpr = Math.min((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1, 2), k = Math.min(this.larg / this.proj.W, this.larg / this.proj.H);
    this.dw = Math.round(this.proj.W * k); this.dh = Math.round(this.proj.H * k); this.dpr = dpr; this.k = k;
    const raiz = this.raiz = css(document.createElement('div'), 'position:absolute;right:10px;bottom:10px;z-index:6;font:12px system-ui,Segoe UI,sans-serif;color:#eef0f4;user-select:none');
    raiz.setAttribute('data-rv', 'mapa');
    /* recolhido: um botão pequeno */
    const bt = this.btAbrir = css(document.createElement('button'), 'display:none;cursor:pointer;background:rgba(10,12,16,.78);color:#eef0f4;border:1px solid rgba(255,255,255,.22);border-radius:8px;padding:6px 10px;font:inherit');
    bt.type = 'button'; bt.textContent = 'Mapa (M)'; bt.setAttribute('data-rv', 'mapa-abrir'); bt.title = 'Abrir o mapa da planta (tecla M)';
    const pn = this.painel = css(document.createElement('div'), 'background:rgba(10,12,16,.82);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:6px;box-shadow:0 6px 24px rgba(0,0,0,.45);width:' + (this.dw + 12) + 'px');
    const cab = css(document.createElement('div'), 'display:flex;align-items:center;gap:6px;margin-bottom:5px');
    const tit = css(document.createElement('b'), 'font-weight:600;letter-spacing:.2px'); tit.textContent = 'Mapa';
    const sel = this.selPav = css(document.createElement('select'), 'flex:1;min-width:0;background:rgba(10,12,16,.9);color:#eef0f4;border:1px solid rgba(255,255,255,.22);border-radius:6px;padding:2px 4px;font:inherit');
    sel.setAttribute('data-rv', 'mapa-pav'); sel.title = 'Pavimento';
    this.pavs.forEach((p) => { const op = document.createElement('option'); op.value = p.id; op.textContent = p.nome; sel.appendChild(op); });
    if (this.pavs.length < 2) sel.style.display = 'none';
    const fe = this.btFechar = css(document.createElement('button'), 'cursor:pointer;background:transparent;color:#cfd4dc;border:1px solid rgba(255,255,255,.22);border-radius:6px;padding:0 7px;font:inherit;line-height:20px'); fe.type = 'button'; fe.textContent = '–'; fe.title = 'Recolher o mapa (tecla M)'; fe.setAttribute('data-rv', 'mapa-recolher');
    cab.appendChild(tit); cab.appendChild(sel); cab.appendChild(fe);
    const cv = this.cv = document.createElement('canvas');
    cv.width = Math.round(this.dw * dpr); cv.height = Math.round(this.dh * dpr); cv.style.cssText = 'display:block;width:' + this.dw + 'px;height:' + this.dh + 'px;border-radius:6px;cursor:pointer;background:#dbe1e8;touch-action:none';
    cv.setAttribute('data-rv', 'mapa-canvas');
    const pe = this.rodape = css(document.createElement('div'), 'margin-top:5px;font-size:11px;color:#cfd4dc;min-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
    pn.appendChild(cab); pn.appendChild(cv); pn.appendChild(pe);
    raiz.appendChild(bt); raiz.appendChild(pn);
    this.escuro = css(document.createElement('div'), 'position:absolute;inset:0;z-index:3;background:#000;opacity:0;pointer-events:none');
    this.tela.appendChild(this.escuro); this.tela.appendChild(raiz);
    this.ctx = cv.getContext('2d');
    this.fundo = document.createElement('canvas'); this.fundo.width = cv.width; this.fundo.height = cv.height;
    this._aplicarAberto();
  }
  _aplicarAberto() { this.painel.style.display = this.aberto ? '' : 'none'; this.btAbrir.style.display = this.aberto ? 'none' : ''; }
  alternar(on) {
    this.aberto = on === undefined ? !this.aberto : !!on; this._aplicarAberto();
    if (this.aberto) this._pintar(true);
    if (this.o.aoPref) { try { this.o.aoPref({ mapa: this.aberto }); } catch (e) { /* preferência é detalhe */ } }
    return this.aberto;
  }

  /* ----------------------------------------------------------- eventos */
  _ligar() {
    const on = (alvo, nome, f, op) => { alvo.addEventListener(nome, f, op); this._ev.push([alvo, nome, f, op]); };
    on(this.btAbrir, 'click', () => this.alternar(true));
    on(this.btFechar, 'click', () => this.alternar(false));
    on(this.selPav, 'change', () => { const p = this.pavs.filter((q) => q.id === this.selPav.value)[0]; this.selPav.blur(); try { this.vivo.canvas.focus(); } catch (e) { /* sem foco */ } if (p) this.irPavimento(p.id); });
    const pos = (e) => { const r = this.cv.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height; return this.proj.paraMundo(fx * this.proj.W, fy * this.proj.H); };
    on(this.cv, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.irPonto(pos(e)); });
    on(this.cv, 'pointermove', (e) => { const p = pos(e), a = this.pav && ambienteEm(p, this.pav.ambientes); const novo = a ? a.id : null; if (novo !== this.hover) { this.hover = novo; this.cv.title = a ? a.nome : ''; this._pintar(true); } });
    on(this.cv, 'pointerleave', () => { if (this.hover) { this.hover = null; this._pintar(true); } });
    on(this.painel, 'wheel', (e) => e.stopPropagation(), { passive: true });
    /* TECLADO / CONTROLE REMOTO — na captura da janela, antes do caminhar (que também usa as setas) */
    const tecla = (e) => {
      if (!this._vivo) return;
      const t = (e.target && e.target.tagName) || ''; if (/input|textarea/i.test(t) || (/select/i.test(t) && e.code !== 'KeyM')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.code === 'KeyM') { eat(); this.alternar(); return; }
      if (!this.aberto) return;
      const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.code];
      if (dir) { eat(); if (e.type === 'keydown') this.escolher(dir[0], dir[1]); return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { eat(); if (e.type === 'keydown' && this.sel) this.irAmbiente(this.sel.id); return; }
      if (e.code === 'PageUp' || e.code === 'PageDown') { eat(); if (e.type === 'keydown') this.outroPavimento(e.code === 'PageUp' ? 1 : -1); return; }
      if (e.code === 'Escape') { eat(); if (e.type === 'keydown') this.alternar(false); }
    };
    on(window, 'keydown', tecla, true); on(window, 'keyup', (e) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyM'].indexOf(e.code) >= 0 && (this.aberto || e.code === 'KeyM')) e.stopImmediatePropagation(); }, true);
  }

  /* seta: o próximo ambiente na direção (só escolhe; Enter vai) */
  escolher(dx, dz) {
    if (!this.pav) return null;
    const n = vizinho(this.pav.ambientes, this.sel, dx, dz);
    if (n) { this.sel = n; this._pintar(true); }
    return this.sel;
  }
  outroPavimento(passo) {
    const i = this.pavs.indexOf(this.pav), j = i + passo; if (j < 0 || j >= this.pavs.length) return false;
    this.irPavimento(this.pavs[j].id); return true;
  }

  /* ----------------------------------------------------------- a planta: o CORTE + o que está abaixo dele, tudo na CPU */
  /* AS MALHAS DO PRÉDIO, uma vez: a geometria crua do motor, a classe do material e os SÓLIDOS (triângulos que dividem aresta).
     ⚠ A CONSTRUÇÃO VAI TODA NUMA SOPA SÓ: o motor separa as faces por MATERIAL (reboco numa malha, azulejo noutra, espelho noutra), então uma
     parede é feita de pedaços em várias malhas — as duas faces de reboco e as pontas de outro material. Cortar malha por malha dava duas
     linhas soltas por parede (medido em 21/10/2026: 191 linhas abertas e quase nenhum laço); juntas, o laço fecha. Vidro, água e piso
     externo ficam à parte. O entorno (grama, árvores) e as malhas com matriz própria não entram: o mapa é só da construção. */
  *_passosPreparar() {
    if (this._malhas) return this._malhas;
    const t0 = performance.now(), por = { geral: [], exterior: [], agua: [], vidro: [] }; let ignoradas = 0;
    this.vivo.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || malhaDoEntorno(o)) return;
      const c = classeDaMalha(o.material && o.material.userData && o.material.userData.id); if (!c) return;
      const pa = o.geometry.attributes.position;
      if (pa.isInterleavedBufferAttribute || !pa.array) { ignoradas++; return; }
      o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements;
      if (e.some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-9)) { ignoradas++; return; }   /* com matriz própria: posição ≠ geometria (não é o prédio) */
      por[c].push({ pos: pa.array, idx: o.geometry.index ? o.geometry.index.array : null });
    });
    const L = []; let tri = 0;
    for (const c of Object.keys(por)) {
      const g = por[c]; if (!g.length) continue;
      const pos = new Float32Array(g.reduce((a, q) => a + q.pos.length, 0)), nIdx = g.reduce((a, q) => a + (q.idx ? q.idx.length : q.pos.length / 3), 0), idx = new Uint32Array(nIdx);
      let po = 0, io = 0;
      g.forEach((q) => { pos.set(q.pos, po); const n = q.idx ? q.idx.length : q.pos.length / 3, base = po / 3; for (let k = 0; k < n; k++) idx[io + k] = base + (q.idx ? q.idx[k] : k); po += q.pos.length; io += n; });
      const an = yield* passosAnalisarSolidos(pos, idx, LOTE_ANALISE); tri += an.nTri; L.push({ cls: c, pos, idx, an, malhas: g.length });
    }
    this._malhas = L; this.nMalhas = L.reduce((a, m) => a + m.malhas, 0);
    this._prep = { ms: Math.round(performance.now() - t0), malhas: this.nMalhas, triangulos: tri, solidos: L.map((m) => m.cls + ':' + m.an.nComp).join(' '), ignoradas };
    return L;
  }
  _prepararMalhas() { return correr(this._passosPreparar()); }

  /* O QUE ESTÁ ABAIXO DO CORTE: os sólidos inteiros abaixo do plano, vistos de cima, com profundidade (o mais alto vence), a cor pela altura
     sobre o piso do pavimento. Na CPU — sem GPU, sem textura, sem leitura assíncrona (ver o porquê em rasterizarTopo). */
  *_passosDesenhar(pav) {
    yield* this._passosPreparar();
    const pr = this.proj, or = this.origem, yc = pav.y + CORTE - or[1], baixo = Math.min.apply(null, this.pavs.map((p) => p.y));
    const op = { contexto: pav.y > baixo + 0.5, piso: !pav.ambientes.length }, t0 = performance.now(), fontes = []; let n = 0;
    this._paletas = this._paletas || {};
    this._malhas.forEach((m) => {
      const tris = triangulosAbaixoDoCorte(m.an, yc); if (!tris.length) return;
      const kp = m.cls + (op.contexto ? 'c' : '') + (op.piso ? 'p' : ''); n += tris.length;
      fontes.push({ pos: m.pos, idx: m.idx, tris, pal: this._paletas[kp] || (this._paletas[kp] = paletaDaPlanta(m.cls, op, COR)), ox: or[0], oy: or[1], oz: or[2], pisoY: pav.y });
    });
    const rgba = yield* passosRasterizarTopo(pr.W, pr.H, pr.esc, pr.minX, pr.minZ, fontes, SUPERAMOSTRA, LOTE_RASTER);
    return { rgba, tempos: { raster: Math.round(performance.now() - t0) }, desenhadas: n };
  }
  _desenhar(pav) { return correr(this._passosDesenhar(pav)); }

  /* O CORTE: o plano a CORTE m do piso atravessa os sólidos que o cruzam; a seção é parede (alta: cheia e escura), peça alta de mobília
     (armário, porta: cinza) ou vidro (linha azul). Em metros do motor (x, z já com a origem somada na hora de pintar). Um grupo por malha:
     os buracos só descontam da própria malha. */
  *_passosCortes(pav) {
    yield* this._passosPreparar();
    const or = this.origem, yc = pav.y + CORTE - or[1], r = { parede: [], alto: [], vidro: [], abertas: [], laços: 0 }, t0 = performance.now();
    for (const m of this._malhas) {
      if (m.cls === 'exterior' || m.cls === 'agua') continue;
      const c = yield* passosCortarSolidos(m.pos, m.idx, m.an, yc, LOTE_CORTE);
      if (m.cls === 'vidro') { c.lacos.concat(c.abertas).forEach((l) => r.vidro.push(l.pts)); continue; }
      const classe = (topo) => (topo + or[1] - pav.y >= ALTURA_PAREDE ? 'parede' : 'alto'), g = { parede: [], alto: [] };
      /* parede = alta E fina; alta e bojuda (guarda-roupa até o forro) é peça de mobília */
      const org = yield* passosOrganizarLacos(c.lacos, LOTE_ORGANIZAR);
      org.forEach((l) => { const k = !l.buraco && !l.furos && espessuraDoLaco(l) >= ESPESSURA_PECA ? 'alto' : classe(l.topo); g[l.buraco && l.pai ? classe(l.pai.topo) : k].push(l.pts); r.laços++; });
      ['parede', 'alto'].forEach((k) => { if (g[k].length) r[k].push(g[k]); });
      c.abertas.forEach((l) => r.abertas.push({ pts: l.pts, classe: classe(l.topo) }));
    }
    r.ms = Math.round(performance.now() - t0); return r;
  }
  _cortes(pav) { return correr(this._passosCortes(pav)); }

  /* A PLANTA PRONTA: fundo, piso dos ambientes, o que a GPU desenhou abaixo do corte e, por cima, a seção do corte. */
  _compor(pav, camada, cortes) {
    const pr = this.proj, W = pr.W, H = pr.H, or = this.origem, base = document.createElement('canvas'); base.width = W; base.height = H;
    const ctx = base.getContext('2d', { willReadFrequently: true });
    const px = (x, z) => pr.paraPx(x, z);
    const caminho = (pts, mundo) => { pts.forEach((p, i) => { const q = mundo ? px(p[0] + or[0], p[1] + or[2]) : px(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); };
    ctx.fillStyle = css3(COR.fundo); ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = css3(COR.piso);
    pav.ambientes.forEach((a) => { ctx.beginPath(); caminho(a.pts, false); (a.furos || []).forEach((f) => caminho(f, false)); ctx.fill('evenodd'); });
    const gc = document.createElement('canvas'); gc.width = W; gc.height = H; gc.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(camada, W, H), 0, 0); ctx.drawImage(gc, 0, 0);   /* canvas de CPU: o de GPU esperaria a fila da placa para ler */
    /* "não-zero": os laços já vêm todos no mesmo sentido, os buracos no contrário (organizarLacos) */
    const encher = (grupos, c) => { ctx.fillStyle = ctx.strokeStyle = css3(c); ctx.lineWidth = 1; ctx.lineJoin = 'miter'; grupos.forEach((g) => { ctx.beginPath(); g.forEach((l) => caminho(l, true)); ctx.fill('nonzero'); ctx.stroke(); }); };
    encher(cortes.alto, COR.objAlto); encher(cortes.parede, COR.parede);
    const linha = (pts, cor, larg) => { ctx.strokeStyle = css3(cor); ctx.lineWidth = larg; ctx.beginPath(); pts.forEach((p, i) => { const q = px(p[0] + or[0], p[1] + or[2]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); };
    cortes.abertas.forEach((a) => linha(a.pts, a.classe === 'parede' ? COR.parede : COR.objAlto, 1.2));   /* parede que não fechou o laço: ao menos a linha */
    cortes.vidro.forEach((pts) => linha(pts, COR.vidroLinha, 1.6));
    return { base, rgba: ctx.getImageData(0, 0, W, H).data, cortes: { parede: cortes.parede.length, alto: cortes.alto.length, vidro: cortes.vidro.length, abertas: cortes.abertas.length, lacos: cortes.laços, ms: cortes.ms } };
  }

  async _mostrar(pav) {
    if (!pav) return;
    const tok = this._tokMostrar = (this._tokMostrar || 0) + 1;
    let c = this._cache[pav.id];
    if (!c) {
      this._rodape('Desenhando a planta…');
      const t0 = performance.now();
      await this._rodar(this._passosPreparar());
      const des = await this._rodar(this._passosDesenhar(pav));
      const cortes = await this._rodar(this._passosCortes(pav));
      if (!this._vivo || tok !== this._tokMostrar || !des || !cortes) return;
      await this._quadro(); const pr = this.proj, comp = this._compor(pav, des.rgba, cortes);
      c = this._cache[pav.id] = { base: comp.base, gr: grade(comp.rgba, pr.W, pr.H), ms: Math.round(performance.now() - t0), tempos: des.tempos, cortes: comp.cortes, prep: this._prep, desenhadas: des.desenhadas };
    }
    if (!this._vivo || tok !== this._tokMostrar) return;
    const cb = this._cameraBim();
    this.pav = pav; this.sel = pav.ambientes.indexOf(this.sel) >= 0 ? this.sel : (ambienteEm([cb.x, cb.z], pav.ambientes) || maiorAmbiente(pav.ambientes) || null);
    this.selPav.value = pav.id; this._montarFundo(c);
    this._rodape(''); this._pintar(true);
  }
  /* o fundo reduzido ao tamanho da tela, com os nomes — pronto para só copiar por quadro */
  _montarFundo(c) {
    const ctx = this.fundo.getContext('2d'), pr = this.proj;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.fundo.width, this.fundo.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c.base, 0, 0, pr.W, pr.H, 0, 0, this.fundo.width, this.fundo.height);
    /* os nomes, sem se atropelarem */
    ctx.font = '600 ' + Math.round(9.5 * this.dpr) + 'px system-ui,Segoe UI,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const caixas = [];
    this.pav.ambientes.slice().sort((a, b) => b.area - a.area).forEach((a) => {
      const t = a.rotulo || a.nome; if (!t) return;
      const [px, py] = pr.paraPx(a.cx, a.cz);
      const X = px * (this.fundo.width / pr.W), Y = py * (this.fundo.height / pr.H), w = ctx.measureText(t).width + 4, h = 12 * this.dpr;
      if (w > Math.sqrt(a.area) * pr.esc * (this.fundo.width / pr.W) * 1.5) return;   /* não cabe no ambiente */
      const r = [X - w / 2, Y - h / 2, X + w / 2, Y + h / 2];
      if (caixas.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) return;
      caixas.push(r);
      ctx.lineWidth = 3 * this.dpr; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText(t, X, Y);
      ctx.fillStyle = '#1b2230'; ctx.fillText(t, X, Y);
    });
  }
  /* a planta desenhada (PNG, data URL) do pavimento atual — conferência e foto */
  imagemBase() { const c = this._cache_(); return c ? c.base.toDataURL('image/png') : null; }
  _rodape(t) { if (this.rodape) this.rodape.textContent = t || ''; }

  /* ----------------------------------------------------------- pintura por quadro */
  _pintar(forca) {
    if (!this.aberto || !this.pav || !this.ctx) return;
    const cam = this._cameraBim(), yaw = this._yawAtual(), pr = this.proj;
    const chave = [cam.x.toFixed(2), cam.z.toFixed(2), yaw.toFixed(2), this.pav.id, this.sel && this.sel.id, this.hover].join('|');
    if (!forca && chave === this._ult) return;
    this._ult = chave;
    const ctx = this.ctx, sx = this.cv.width / pr.W, sy = this.cv.height / pr.H;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cv.width, this.cv.height); ctx.drawImage(this.fundo, 0, 0);
    const poli = (a, estilo) => {
      ctx.beginPath(); a.pts.forEach((p, i) => { const [x, y] = pr.paraPx(p[0], p[1]); i ? ctx.lineTo(x * sx, y * sy) : ctx.moveTo(x * sx, y * sy); }); ctx.closePath();
      (a.furos || []).forEach((f) => { f.forEach((p, i) => { const [x, y] = pr.paraPx(p[0], p[1]); i ? ctx.lineTo(x * sx, y * sy) : ctx.moveTo(x * sx, y * sy); }); ctx.closePath(); });
      ctx.fillStyle = estilo.fill; ctx.fill('evenodd'); if (estilo.line) { ctx.lineWidth = estilo.w * this.dpr; ctx.strokeStyle = estilo.line; ctx.stroke(); }
    };
    const hv = this.hover && this.pav.ambientes.filter((a) => a.id === this.hover)[0];
    if (hv && hv !== this.sel) poli(hv, { fill: 'rgba(255,159,28,.16)' });
    if (this.sel) poli(this.sel, { fill: 'rgba(255,159,28,.24)', line: ACENTO, w: 1.6 });
    /* o pontinho e o cone da visão — só se a câmera está dentro do pavimento mostrado (senão fica a borda do mapa) */
    const [px, py] = pr.paraPx(cam.x, cam.z), X = px * sx, Y = py * sy;
    if (X > -20 && Y > -20 && X < this.cv.width + 20 && Y < this.cv.height + 20) {
      const hf = 2 * Math.atan(Math.tan(this.vivo.camera.fov * Math.PI / 360) * (this.vivo.camera.aspect || 1.6)), R = 26 * this.dpr;
      const gr = ctx.createRadialGradient(X, Y, 0, X, Y, R); gr.addColorStop(0, 'rgba(255,59,48,.55)'); gr.addColorStop(1, 'rgba(255,59,48,0)');
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.arc(X, Y, R, yaw - hf / 2, yaw + hf / 2); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
      ctx.beginPath(); ctx.arc(X, Y, 4.6 * this.dpr, 0, TAU); ctx.fillStyle = PONTO; ctx.fill(); ctx.lineWidth = 1.8 * this.dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    const aqui = ambienteEm([cam.x, cam.z], this.pav.ambientes);
    this._rodape(this._voando ? 'Indo…' : (aqui ? 'Você está: ' + (aqui.rotulo || aqui.nome) : (this.pav.ambientes.length ? 'Clique para ir · M recolhe' : 'Clique num ponto da planta para ir')));
  }
  _tick() {
    if (!this._vivo) return;
    this._raf = requestAnimationFrame(this._tick);
    const t0 = performance.now();
    /* a câmera subiu ou desceu de pavimento: o mapa troca sozinho */
    if (!this._voando && !this._mudando && this.pavs.length > 1) {
      const cam = this._cameraBim(), i = pavimentoDaAltura(this.pavs, cam.y), p = this.pavs[i];
      if (p !== this.pav && (!this._cooldown || performance.now() > this._cooldown)) {
        this._mudando = true; this._cooldown = performance.now() + 500;
        this._mostrar(p).then(() => { this._mudando = false; }, () => { this._mudando = false; });
      }
    }
    this._pintar(false);
    const dt = performance.now() - t0; this._custoTick = (this._custoTick || 0) + dt; this._nTick = (this._nTick || 0) + 1; if (dt > (this._maxTick || 0)) this._maxTick = dt;
  }

  /* ----------------------------------------------------------- IR PARA */
  _cache_() { return this.pav && this._cache[this.pav.id]; }
  /* o lado mais aberto a partir de p (m), sobre a planta desenhada; `preferir` desempata */
  ladoAberto(p, preferir) {
    const c = this._cache_(); if (!c) return preferir != null ? preferir : 0;
    return escolherLadoAberto(varrerRaios(c.gr, this.proj, p, 72, ALCANCE), { preferir }).angulo;
  }
  /* o piso sob (x, z): a superfície horizontal mais alta entre 0,7 m abaixo e 0,5 m acima do piso do pavimento; sem achar, a cota do pavimento */
  _pisoEm(x, z, pav) {
    try {
      const or = this.origem, fontes = (this._malhas || []).filter((m) => m.cls === 'geral' || m.cls === 'exterior').map((m) => ({ pos: m.pos, idx: m.idx, tris: null, ox: or[0], oy: or[1], oz: or[2] }));
      const y = alturaDoPiso(fontes, x, z, pav.y - 0.7, pav.y + 0.5); if (y !== null) return y;
    } catch (e) { /* cai na cota */ }
    return pav.y;
  }
  /* voa a câmera: dest = { x, y(olho), z, yaw } em coordenadas do BIM; devolve uma promessa (true = chegou) */
  voar(dest) {
    const v = this.vivo, cam = v.camera, nav = v.nav, or = this.origem;
    if (this._voando) { this._voando.cancelado = true; }
    const p0 = cam.position.clone(), a0 = this._yawAtual();
    const p1 = { x: dest.x - or[0], y: dest.y - or[1], z: dest.z - or[2] };
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z), dur = dist < 1.5 ? 0.3 : 0.5, alvoD = 2.5;
    const est = this._voando = { cancelado: false };
    const t0 = performance.now(), escuro = Math.min(1, dist / 4) * 0.9;
    return new Promise((res) => {
      const passo = (agora) => {
        if (est.cancelado || !this._vivo) { this._escurecer(0); res(false); return; }
        const t = Math.max(0, Math.min(1, (agora - t0) / 1000 / dur)), s = suave(t);
        const a_ = interpAng(a0, dest.yaw, s);
        const x = p0.x + (p1.x - p0.x) * s, y = p0.y + (p1.y - p0.y) * s, z = p0.z + (p1.z - p0.z) * s;
        nav.olhar({ x: x, y: y, z: z }, { x: x + Math.cos(a_) * alvoD, y: y, z: z + Math.sin(a_) * alvoD });
        v.mexeu(); this._escurecer(Math.sin(Math.PI * t) * escuro);
        if (t < 1) requestAnimationFrame(passo); else { this._voando = null; this._escurecer(0); this._yaw = dest.yaw; this._pintar(true); res(true); }
      };
      requestAnimationFrame(passo);
    });
  }
  _escurecer(f) { if (this.escuro) this.escuro.style.opacity = String(Math.max(0, Math.min(1, f))); }

  /* clicar num ambiente */
  async irAmbiente(id) {
    const a = this.pav && this.pav.ambientes.filter((q) => q.id === String(id))[0]; if (!a) return false;
    this.sel = a;
    const p = [a.cx, a.cz], yaw = this.ladoAberto(p, this._yawAtual()), y = (isFinite(a.base) ? a.base : this.pav.y) + OLHO;
    this._pintar(true);
    return this.voar({ x: p[0], y, z: p[1], yaw });
  }
  /* clicar num ponto da planta (m, BIM): dentro de um ambiente vai ao centro dele; fora de todos, ao ponto livre mais perto (piso por raio) */
  async irPonto(p) {
    if (!this.pav) return false;
    const a = ambienteEm(p, this.pav.ambientes);
    if (a) return this.irAmbiente(a.id);
    const c = this._cache_(), q = c ? pontoLivre(c.gr, this.proj, p, 0.6) : p;
    if (!q) { this._rodape('Aí é parede.'); return false; }
    this._pintar(true);
    return this.voar({ x: q[0], y: this._pisoEm(q[0], q[1], this.pav) + OLHO, z: q[1], yaw: this._yawAtual() });
  }
  /* trocar de pavimento pelo seletor: vai ao maior ambiente dele (ou, sem ambiente, ao miolo da planta) */
  async irPavimento(id) {
    const p = this.pavs.filter((q) => q.id === id)[0]; if (!p) return false;
    this._mudando = true;
    try { await this._mostrar(p); } finally { this._mudando = false; }
    const a = maiorAmbiente(p.ambientes);
    if (a) return this.irAmbiente(a.id);
    const c = this._cache_(); if (!c) return false;
    /* sem ambiente: o miolo do que é parede (média dos pixels escuros), puxado ao ponto livre mais perto */
    let sx = 0, sy = 0, n = 0; const g = c.gr;
    for (let y = 0; y < g.H; y += 4) for (let x = 0; x < g.W; x += 4) if (g.ocupado[y * g.W + x]) { sx += x; sy += y; n++; }
    const m = n ? this.proj.paraMundo(sx / n, sy / n) : [this.proj.cx, this.proj.cz], q = pontoLivre(g, this.proj, m, 6) || m;
    return this.voar({ x: q[0], y: this._pisoEm(q[0], q[1], p) + OLHO, z: q[1], yaw: this.ladoAberto(q, this._yawAtual()) });
  }
  irPara(alvo) {
    if (alvo && alvo.ambId != null) return this.irAmbiente(alvo.ambId);
    if (alvo && alvo.pav != null && alvo.x == null) return this.irPavimento(alvo.pav);
    if (alvo && alvo.x != null) return this.irPonto([alvo.x, alvo.z]);
    return Promise.resolve(false);
  }

  /* ----------------------------------------------------------- estado (diagnóstico e testes) */
  estado() {
    const cam = this._cameraBim(), aqui = this.pav ? ambienteEm([cam.x, cam.z], this.pav.ambientes) : null, c = this._cache_();
    return { aberto: this.aberto, fonte: this.fonte, pav: this.pav && { id: this.pav.id, nome: this.pav.nome, y: this.pav.y }, pavs: this.pavs.map((p) => ({ id: p.id, nome: p.nome, y: p.y, ambientes: p.ambientes.length })),
             camera: { x: +cam.x.toFixed(3), y: +cam.y.toFixed(3), z: +cam.z.toFixed(3), yaw: +this._yawAtual().toFixed(3) },
             ambienteAtual: aqui ? { id: aqui.id, nome: aqui.nome } : null, selecionado: this.sel ? { id: this.sel.id, nome: this.sel.nome } : null,
             planta: { W: this.proj.W, H: this.proj.H, escala: +this.proj.esc.toFixed(2), malhas: this.nMalhas, ms: c ? c.ms : null, tempos: c ? c.tempos : null, cortes: c ? c.cortes : null, preparo: c ? c.prep : null, desenhadas: c ? c.desenhadas : null },
             voando: !!this._voando, diag: this.dados && this.dados.diag || null, marcas: this._marcas || null, custoQuadroMs: this._nTick ? +(this._custoTick / this._nTick).toFixed(3) : null, custoMaxMs: +(this._maxTick || 0).toFixed(3) };
  }
  ambientes() { return this.pavs.map((p) => ({ pav: p.id, ambientes: p.ambientes.map((a) => ({ id: a.id, nome: a.nome, area: +a.area.toFixed(2), cx: +a.cx.toFixed(3), cz: +a.cz.toFixed(3), base: +a.base.toFixed(3) })) })); }
  dentroDoAmbiente(id) {
    const cam = this._cameraBim(); let r = null;
    this.pavs.forEach((p) => p.ambientes.forEach((a) => { if (a.id === String(id)) r = pontoDentro([cam.x, cam.z], a.pts, a.furos); }));
    return r;
  }

  descartar() {
    this._vivo = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._voando) this._voando.cancelado = true;
    this._ev.forEach(([a, n, f, o]) => { try { a.removeEventListener(n, f, o); } catch (e) { /* já solto */ } });
    this._ev = [];
    [this.raiz, this.escuro].forEach((el) => { try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) { /* já removido */ } });
    this._cache = {}; this._malhas = null; this._paletas = null;
  }
}

export async function abrirMapa(o) {
  const m = new MapaPlanta(o);
  await m.iniciar();
  return m;
}

/* =====================================================================
 * bimluzassada.js — A LUZ ASSADA (lightmap por superfície) do render ao
 * vivo (módulo ES, 20/10/2026; usado pelo js/bimrendervivo.js)
 *
 * O que resolve: andando, o interior tem de ter a MESMA luz da foto física
 * (o path tracer parado). As sondas do js/bimluzobra.js dão a luz indireta
 * a cada ~0,46 m: certa na média, mas borrada — o canto escuro do teto, a
 * faixa de luz que entra pela janela e bate no piso, a parede que recebe o
 * rebote do piso ensolarado somem. A obra é ESTÁTICA: a luz indireta de
 * cada superfície grande é calculada uma vez e GRAVADA numa textura (o
 * "lightmap" dos jogos e do Enscape/Twinmotion), a ~3 cm por texel.
 *
 * Como (as decisões e o porquê):
 * 1. UV2 com o xatlas (MIT, WASM, worker clássico js/bimluzassada-uv.js):
 *    cada superfície ganha um pedaço PRÓPRIO de um atlas único, sem
 *    sobreposição, com 2 texels de margem. Densidade de texel UNIFORME
 *    (cm/texel igual em toda a casa) e o tamanho do atlas pelo teto da
 *    qualidade (Ultra 8 M texels = 64 MB em meio-float na placa). Na Casa
 *    487 (~5 100 m² fora o terreno) isso dá ~3 cm/texel.
 *    Ficam de fora (seguem com as sondas): vidro e água (a luz passa),
 *    espelho, o terreno sem fim (> 120 m, céu aberto) e malha densa demais
 *    para o texel (> 150 triângulos/m²: folhagem, flores, louça, inox —
 *    seriam milhares de pedaços minúsculos de atlas para quase nada de área).
 * 2. O cálculo na PLACA, em WebGL2 (contexto próprio, como o path tracer),
 *    com o BVH em GLSL do three-mesh-bvh 0.9.16 já vendorizado. Primeiro a
 *    malha é "desenhada no espaço da UV2" (G-buffer do atlas: posição e
 *    normal de cada texel; uma passada de arestas antes cobre o texel que a
 *    borda do triângulo só raspa). Depois, por texel e por amostra: um raio
 *    no hemisfério com peso de cosseno —
 *      · escapou → radiância do CÉU naquela direção (o mesmo equirretangular
 *        em cd/m² que o path tracer e as sondas usam);
 *      · bateu → albedo/π × (sol direto no ponto atingido, com raio de
 *        sombra + a irradiância da passada anterior lida do PRÓPRIO atlas
 *        pela UV2 do triângulo atingido);
 *      · bateu em superfície SEM atlas (terreno, miúdos) ou no VERSO de uma
 *        face → mais UM raio a partir dali (estimativa de uma amostra da
 *        luz que chega lá) — sem isso o gramado ensolarado lá fora, que é o
 *        que mais clareia uma sala pela janela, entraria só com o sol.
 *    E = π × média (estimador do cosseno). Gravado em klux (teto do
 *    meio-float). O SOL DIRETO não entra: ele continua da luz direcional com
 *    o mapa de sombra do tempo real (nítido).
 * 3. Passadas = rebotes: cada passada usa a anterior como "luz que chega"
 *    nos pontos atingidos. Rápida: 4 passadas de 8–16 amostras (segundos);
 *    completa: mais 4 de 32→512 (minutos) = 8 rebotes (o path tracer da
 *    foto física usa 6). Ao fim de cada passada: resolução, LIMPEZA DE RUÍDO
 *    à-trous (Dammertz 2010) guiada por normal e posição (o vizinho do atlas
 *    que é de outra superfície pesa zero) e DILATAÇÃO (o texel vazio ou
 *    inválido herda a média dos vizinhos válidos: costura sem linha preta).
 * 4. Texel INVÁLIDO: se > 25 % dos raios batem no VERSO de uma face a menos
 *    de 30 cm, o texel está dentro da parede (o piso que passa por baixo
 *    dela) — a mesma regra das sondas (DDGI); some e a dilatação preenche.
 *    Sem isso nasce a linha escura no pé de toda parede.
 * 5. A placa é dividida com o tempo real: o cálculo vai em faixas de linhas
 *    do atlas, ~6–12 ms de placa por quadro (medido pela consulta de tempo
 *    da placa quando existe; senão por cerca/fence), para o andar não
 *    engasgar. Um cálculo novo (hora do sol mudou) cancela o anterior.
 *
 * Unidades: lux, as do motor físico. No atlas: rgb = klux, a = fração de
 * céu visível (−1 = sem dado). O js/bimrendervivo.js lê pela UV2 (× 1000 ×
 * pré-exposição) no lugar da irradiância difusa do ambiente/das sondas.
 *
 * LUMINÁRIAS (frente E, js/bimluzluminarias.js): a direta delas (com raio
 * de sombra, as grandezas do path tracer) é calculada antes das passadas e
 * SOMADA em cada uma — vai para a tela e é a "luz que chega" dos rebotes.
 * O tempo real anda sem luz de luminária no shader.
 *
 * Fora do cálculo (limites conhecidos): o vidro (a luz passa sem perda de
 * Fresnel; o path tracer perde ~8 %), o espelho (entra como difuso 0,7) e a
 * cor da textura (o albedo é a média da textura × cor do material).
 * ===================================================================== */
import * as THREE from '../bim/vendor/jsm/pathtracer/three/three.module.js';
import { MeshBVH, MeshBVHUniformStruct, SAH } from '../bim/vendor/jsm/pathtracer/three-mesh-bvh.module.js';
import { albedoDe } from './bimluzobra.js';
import { luzesParaPlaca, GLSL_LUMINARIAS } from './bimluzluminarias.js';

/* o que cada qualidade grava (texel-alvo em m; teto do atlas em texels) e as PASSADAS: [amostras, vai para a tela?, opções]
   ⚠ 5 PASSADAS = 5 REBOTES, os mesmos do path tracer da foto física (bounces = 6 conta o raio da câmera como o 1º).
   A 1ª versão fazia 8 passadas: com o reboco branco (albedo ~0,88) o estar saía ~30 % mais claro que a foto (20/10/2026).
   A completa NÃO soma rebote: relê a 4ª passada guardada (guardar/ler) e só refina a 5ª com mais amostras (continuar = soma
   na mesma conta da passada anterior). */
/* [frente E] luminarias = amostras da direta das luminárias (1 luz sorteada + 1 raio de sombra por amostra) */
/* [frente E2] folga = fração do teto que a ESTIMATIVA de custo (custoAtlas) pode ocupar antes de a malha fina sair do atlas.
   A estimativa conta a margem de cada pedaço e o xatlas empacota melhor: no quiosque de ensaio (Ultra) a estimativa deu 4,09 M
   texels e o atlas real 2,9 M (×0,71). Com 0,75 o RIPADO de madeira do bar (383 m², custo 3,2 M) saía para as sondas e à
   noite ficava a ~0,5× a foto física (a luz das luminárias perto dele não cabe numa sonda a 0,4 m) — 21/10/2026. No Ultra o
   teto é folgado (7,6 M): a estimativa pode ir a 100 %. O Leve e o Alta seguem com 0,75 (o Leve do Quiosque é o caso apertado). */
export const ESQUEMAS = {
  leve:  { texel: 0.10, maxTexels: 1.0e6, luminarias: 32, passadas: [[4], [4], [4], [8, null, { guardar: 1 }], [8, 'rapida'], [96, 'completa', { ler: 1 }]] },
  alta:  { texel: 0.05, maxTexels: 3.0e6, luminarias: 48, passadas: [[4], [4], [8], [8, null, { guardar: 1 }], [16, 'rapida'], [192, 'completa', { ler: 1 }]] },
  ultra: { texel: 0.025, maxTexels: 7.6e6, folga: 1.0, luminarias: 64, passadas: [[4], [4], [8], [8, null, { guardar: 1 }], [16, 'rapida'], [128, 'tela', { ler: 1 }], [384, 'completa', { ler: 1, continuar: 1 }]] }
};

const VERSO_MAX = 0.25, VERSO_DIST = 0.3, EPS = 0.002;

/* ---------------------------------------------------------------------
 * QUEM ENTRA: oclusores (tudo opaco, para os raios) e quem ganha atlas
 * --------------------------------------------------------------------- */
export function estatistica(g, M) {
  const p = g.getAttribute('position'), ix = g.index, n = ix ? ix.count : p.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9);
  let area = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    a.fromBufferAttribute(p, ix ? ix.getX(t) : t).applyMatrix4(M); b.fromBufferAttribute(p, ix ? ix.getX(t + 1) : t + 1).applyMatrix4(M); c.fromBufferAttribute(p, ix ? ix.getX(t + 2) : t + 2).applyMatrix4(M);
    mn.min(a).min(b).min(c); mx.max(a).max(b).max(c);
    b.sub(a); c.sub(a); area += b.cross(c).length() / 2;
  }
  return { area, tri: Math.floor(n / 3), yMin: mn.y, tam: mx.sub(mn) };
}
/* [frente E] QUANTO DE ATLAS UMA MALHA GASTA (texels, com a margem): cada pedaço plano conexo (triângulos coplanares que
   dividem vértice) vira um retângulo de (w/t + 2m) × (h/t + 2m). ⚠ Medido 20/10/2026 no quiosque de ensaio: 4 170 m² no Leve
   (texel-alvo 10 cm) não couberam em 1 milhão de texels — a régua desceu a 22 cm. O que gasta não é a área, é a MARGEM:
   uma ripa de 5 cm vira 0,5 texel de face + 4 de margem. Devolve { custo, util } (util = área/t² ÷ custo). */
export function custoAtlas(g, M, t, margem) {
  const p = g.getAttribute('position'), ix = g.index, n = ix ? ix.count : p.count, T = Math.floor(n / 3), m2 = 2 * (margem == null ? 2 : margem);
  if (!T) return { custo: 0, util: 1, pedacos: 0 };
  const V = new Float64Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (M) v.applyMatrix4(M); V[i * 3] = v.x; V[i * 3 + 1] = v.y; V[i * 3 + 2] = v.z; }
  const vi = (k) => (ix ? ix.getX(k) : k), N = new Float64Array(T * 4), pai = new Int32Array(T);
  for (let t3 = 0; t3 < T; t3++) {
    pai[t3] = t3;
    const a = vi(3 * t3) * 3, b = vi(3 * t3 + 1) * 3, c = vi(3 * t3 + 2) * 3;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], wx = V[c] - V[a], wy = V[c + 1] - V[a + 1], wz = V[c + 2] - V[a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    N[t3 * 4] = nx; N[t3 * 4 + 1] = ny; N[t3 * 4 + 2] = nz; N[t3 * 4 + 3] = nx * V[a] + ny * V[a + 1] + nz * V[a + 2];
  }
  const raiz = (x) => { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; };
  const copl = (s, q) => N[s * 4] * N[q * 4] + N[s * 4 + 1] * N[q * 4 + 1] + N[s * 4 + 2] * N[q * 4 + 2] > 0.999 && Math.abs(N[s * 4 + 3] - N[q * 4 + 3]) < 0.005;
  /* vizinho = mesmo PONTO (0,1 mm), não o mesmo índice: a malha da cena repete o vértice em cada face */
  const porVert = new Map(), chave = (o) => Math.round(V[o] * 1e4) + ',' + Math.round(V[o + 1] * 1e4) + ',' + Math.round(V[o + 2] * 1e4);
  for (let t3 = 0; t3 < T; t3++) for (let k = 0; k < 3; k++) {
    const w = chave(vi(3 * t3 + k) * 3), l = porVert.get(w);
    if (!l) { porVert.set(w, [t3]); continue; }
    let junto = false;
    for (const q of l) if (copl(t3, q)) { const ra = raiz(t3), rb = raiz(q); if (ra !== rb) pai[ra] = rb; junto = true; break; }
    if (!junto && l.length < 6) l.push(t3);
  }
  /* o retângulo de cada pedaço no próprio plano: eixo u = a 1ª aresta do 1º triângulo, v = n × u */
  const ped = new Map();
  for (let t3 = 0; t3 < T; t3++) {
    const r = raiz(t3); let e = ped.get(r);
    if (!e) {
      const a = vi(3 * r) * 3, b = vi(3 * r + 1) * 3;
      let ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2]; const lu = Math.hypot(ux, uy, uz) || 1; ux /= lu; uy /= lu; uz /= lu;
      const nx = N[r * 4], ny = N[r * 4 + 1], nz = N[r * 4 + 2];
      e = { u: [ux, uy, uz], v: [ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux], mn: [1e9, 1e9], mx: [-1e9, -1e9] }; ped.set(r, e);
    }
    for (let k = 0; k < 3; k++) {
      const o = vi(3 * t3 + k) * 3, x = V[o], y = V[o + 1], z = V[o + 2];
      const pu = x * e.u[0] + y * e.u[1] + z * e.u[2], pv = x * e.v[0] + y * e.v[1] + z * e.v[2];
      if (pu < e.mn[0]) e.mn[0] = pu; if (pu > e.mx[0]) e.mx[0] = pu; if (pv < e.mn[1]) e.mn[1] = pv; if (pv > e.mx[1]) e.mx[1] = pv;
    }
  }
  let custo = 0, area = 0;
  ped.forEach((e) => { const w = e.mx[0] - e.mn[0], h = e.mx[1] - e.mn[1]; custo += (w / t + m2) * (h / t + m2); });
  for (let t3 = 0; t3 < T; t3++) {
    const a = vi(3 * t3) * 3, b = vi(3 * t3 + 1) * 3, c = vi(3 * t3 + 2) * 3;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], wx = V[c] - V[a], wy = V[c + 1] - V[a + 1], wz = V[c + 2] - V[a + 2];
    area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  return { custo, util: custo > 0 ? area / (t * t) / custo : 1, pedacos: ped.size };
}
/* TERRENO de levantamento que não caiu no nome do material: superfície ABERTA grande, quase toda para cima (o TIN do
   topógrafo, IfcSite) — no quiosque de ensaio o terreno de 57 × 35 m ficava no atlas */
export function pareceTerreno(g, M, e) {
  if (Math.max(e.tam.x, e.tam.z) <= 25 || e.tam.y > 0.5 * Math.max(e.tam.x, e.tam.z)) return false;
  const p = g.getAttribute('position'), ix = g.index, n = ix ? ix.count : p.count, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let cima = 0, baixo = 0, tot = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    a.fromBufferAttribute(p, ix ? ix.getX(t) : t).applyMatrix4(M); b.fromBufferAttribute(p, ix ? ix.getX(t + 1) : t + 1).applyMatrix4(M); c.fromBufferAttribute(p, ix ? ix.getX(t + 2) : t + 2).applyMatrix4(M);
    b.sub(a); c.sub(a); b.cross(c); const ar = b.length() / 2; tot += ar;
    if (ar > 0) { const ny = b.y / (2 * ar); if (ny > 0.5) cima += ar; else if (ny < -0.5) baixo += ar; }
  }
  if (!(tot > 0)) return false;
  /* casca ABERTA: ≥ 85 % da área virada para um lado só e quase nada para o outro (a laje tem a face de baixo igual à de cima) */
  if (Math.max(cima, baixo) / tot > 0.85 && Math.min(cima, baixo) / tot < 0.05) return true;
  /* casca FECHADA com relevo: o terreno do quiosque de ensaio veio como sólido (face de cima E de baixo, material reboco,
     56,7 × 34,9 m, 2,3 m de relevo) e ficava no atlas — o Leve saiu com pixel de 22 cm (medido 21/10/2026). Quase toda a
     área horizontal (cima + baixo > 90 %) e relevo de verdade (≥ 0,5 m, mas ≤ 15 % do lado: a laje grande é plana e um
     bloco de lajes de vários andares tem altura demais) */
  const lado = Math.max(e.tam.x, e.tam.z);
  return e.tam.y >= 0.5 && e.tam.y <= 0.15 * lado && (cima + baixo) / tot > 0.9;
}
export function selecionar(scene, esq) {
  const ocl = [], lm = [], fora = [], cand = [], vid = [];
  let yBase = Infinity;
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry || !o.geometry.getAttribute('position')) return;
    const m = o.material; if (!m) return;
    /* [frente E] o vidro entra nos RAIOS como filtro (não para a luz, tira a cor dele) — ver raio() */
    if (m.transmission > 0 && !m.transparent) { o.updateMatrixWorld(true); vid.push(o); return; }
    if (m.transmission > 0 || m.transparent) return;
    o.updateMatrixWorld(true);
    ocl.push(o);
    const id = (m.userData && m.userData.id) || '';
    if (o.userData.espelho || id === 'espelho') { fora.push([id, 'espelho']); return; }
    const e = estatistica(o.geometry, o.matrixWorld);
    if (Math.max(e.tam.x, e.tam.z) > 120) { fora.push([id, 'terreno']); return; }
    yBase = Math.min(yBase, e.yMin);
    cand.push([o, id, e]);
  });
  cand.forEach(([o, id, e]) => {
    /* TERRENO do levantamento (topossólido, gramado, terra) com dezenas de metros: fica nas sondas — no quiosque de ensaio o
       terreno de 57 × 35 m comia o atlas e o desdobramento desistia ("não coube no teto", 20/10/2026) */
    if (/^(terra|grama|brita|cascalho|areia|asfalto)$/.test(id) && Math.max(e.tam.x, e.tam.z) > 25) { fora.push([id, 'terreno']); return; }
    /* [frente E] … e o terreno que veio com OUTRO material (o IfcSite do Quiosque): casca aberta grande, encostada na base */
    if (e.yMin < yBase + 1.5 && pareceTerreno(o.geometry, o.matrixWorld, e)) { fora.push([id, 'terreno']); return; }
    if (e.area < 0.5) { fora.push([id, 'pequena']); return; }
    if (e.tri / e.area > 150) { fora.push([id, 'densa']); return; }
    lm.push({ mesh: o, area: e.area, tri: e.tri, id });
  });
  /* [frente E] O TETO DO ATLAS SEM ENGROSSAR O TEXEL: se o que sobrou não cabe no teto da qualidade no texel-alvo, sai para
     as sondas primeiro a malha que mais gasta margem por m² (ripado, caibro, perfil fino) — a parede e o piso continuam
     no texel-alvo. Malha de aproveitamento ≥ 35 % nunca sai (aí o xatlas engrossa o texel, como antes). */
  if (esq && lm.length) {
    const t = esq.texel, orc = esq.maxTexels * (esq.folga || 0.75);
    lm.forEach((e) => { const c = custoAtlas(e.mesh.geometry, e.mesh.matrixWorld, t, 2); e.custo = c.custo; e.util = c.util; });
    let tot = lm.reduce((s, e) => s + e.custo, 0);
    const bons = lm.reduce((s, e) => s + (e.util >= 0.35 ? e.custo : 0), 0);
    /* só tira se ISSO devolve o texel-alvo: se nem as boas cabem (Ultra numa casa grande), o texel engrossa para todas e a
       ripa fica no atlas (3 cm no atlas é melhor que a sonda a 40 cm) */
    if (tot > orc && bons <= orc) {
      lm.sort((a, b) => a.util - b.util);
      while (tot > orc && lm.length > 1 && lm[0].util < 0.35) { const e = lm.shift(); tot -= e.custo; fora.push([e.id, 'fina']); }
    }
  }
  return { ocl, lm, fora, vid };
}

/* ---------------------------------------------------------------------
 * A UV2 (xatlas no worker) aplicada na geometria do tempo real (antes do
 * 1º quadro: o material compila uma vez só, já com o atributo uv1)
 * --------------------------------------------------------------------- */
export function abrirUV(lista, op) {
  return new Promise((res, rej) => {
    const w = new Worker(new URL('./bimluzassada-uv.js', import.meta.url));
    const fim = (f, v) => { try { w.terminate(); } catch (e) { /* já encerrado */ } f(v); };
    w.onmessage = (ev) => { const m = ev.data; if (m.cmd === 'uv') fim(res, m); else if (m.cmd === 'erro') fim(rej, new Error(m.erro)); };
    w.onerror = (e) => fim(rej, new Error((e && e.message) || 'worker do xatlas'));
    const v = new THREE.Vector3();
    const malhas = lista.map((e, i) => {
      const g = e.mesh.geometry, p = g.getAttribute('position'), M = e.mesh.matrixWorld, pos = new Float32Array(p.count * 3);
      for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k).applyMatrix4(M); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z; }
      const idx = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: p.count }, (_, k) => k);
      return { id: i, pos, idx, escala: 1 };
    });
    w.postMessage({ cmd: 'uv', malhas, texel: op.texel, maxTexels: op.maxTexels, padding: 2 }, malhas.map((m) => m.pos.buffer));
  });
}
/* refaz a geometria com os vértices que o xatlas abriu na costura (xref) e o atributo uv1 */
export function aplicarUV(lista, r) {
  const tex = 1 / r.tpu;
  r.malhas.forEach((m) => {
    const e = lista[m.id], g0 = e.mesh.geometry, g = new THREE.BufferGeometry(), nv = m.xref.length;
    for (const nome in g0.attributes) {
      const a = g0.attributes[nome], k = a.itemSize, arr = new a.array.constructor(nv * k);
      for (let i = 0; i < nv; i++) { const o = m.xref[i] * k; for (let c = 0; c < k; c++) arr[i * k + c] = a.array[o + c]; }
      g.setAttribute(nome, new THREE.BufferAttribute(arr, k, a.normalized));
    }
    g.setAttribute('uv1', new THREE.BufferAttribute(m.uv, 2));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    e.mesh.geometry = g; g0.dispose();
    e.mesh.userData.lmTexel = tex;
  });
  return { largura: r.largura, altura: r.altura, texel: tex, ms: r.ms, malhas: r.malhas.length };
}

/* ---------------------------------------------------------------------
 * A GEOMETRIA DOS RAIOS SEM TRIÂNGULO GIGANTE: aresta maior que `L` é
 * cortada ao meio (recursivo; o ponto médio da aresta é compartilhado
 * pelos dois vizinhos). ⚠ Medido em 20/10/2026 na Casa 487: com o terreno
 * de 275 m e paredes/lajes de 25 m inteiras, a caixa desses triângulos
 * cobre a casa toda e TODO raio desce por elas — 1,9 µs por raio na placa
 * (75× o path tracer). Só a geometria dos raios muda; a do desenho não.
 * --------------------------------------------------------------------- */
export function subdividir(pos, auv, alb, idx, L) {
  const L2 = L * L, P = Array.from(pos), A = Array.from(auv), B = Array.from(alb), out = [], meio = new Map();
  const d2 = (i, j) => { const x = P[i * 3] - P[j * 3], y = P[i * 3 + 1] - P[j * 3 + 1], z = P[i * 3 + 2] - P[j * 3 + 2]; return x * x + y * y + z * z; };
  const m = (i, j) => {
    const k = i < j ? i * 4194304 + j : j * 4194304 + i; let v = meio.get(k);
    if (v === undefined) {
      v = P.length / 3; meio.set(k, v);
      for (let c = 0; c < 3; c++) P.push((P[i * 3 + c] + P[j * 3 + c]) / 2);
      for (let c = 0; c < 4; c++) { A.push((A[i * 4 + c] + A[j * 4 + c]) / 2); B.push(B[i * 4 + c]); }
    }
    return v;
  };
  const pilha = [];
  for (let t = 0; t < idx.length; t += 3) {
    pilha.push(idx[t], idx[t + 1], idx[t + 2]);
    while (pilha.length) {
      const c = pilha.pop(), b = pilha.pop(), a = pilha.pop();
      const ab = d2(a, b), bc = d2(b, c), ca = d2(c, a), mx = Math.max(ab, bc, ca);
      if (mx <= L2 || out.length > 6e6) { out.push(a, b, c); continue; }
      /* corta a aresta mais longa, mantendo o sentido do triângulo */
      if (mx === ab) { const k = m(a, b); pilha.push(a, k, c, k, b, c); }
      else if (mx === bc) { const k = m(b, c); pilha.push(b, k, a, k, c, a); }
      else { const k = m(c, a); pilha.push(c, k, b, k, a, b); }
    }
  }
  return { pos: new Float32Array(P), auv: new Float32Array(A), alb: new Float32Array(B), idx: new Uint32Array(out) };
}

/* ---------------------------------------------------------------------
 * A ÁRVORE NA PLACA, SEM PILHA ("com fio"): cada nó guarda para onde
 * pular quando a caixa erra ou a subárvore acaba (o irmão da direita, ou
 * o "pular" do pai). ⚠ POR QUÊ (medido 20/10/2026, RTX 5060, ANGLE/D3D11):
 * a travessia do three-mesh-bvh usa `uint stack[60]` com índice dinâmico;
 * com pilha de 60 ou 24 o raio custou ~2–5 µs (240 ms por 35 mil texels),
 * com pilha de 12 custou 0,15 ms — o compilador do Direct3D/driver leva o
 * vetor grande para um caminho de memória catastrófico. Pilha de 12 não
 * serve (a árvore tem profundidade 25: perde acerto = luz vazando). Sem
 * pilha não há vetor nenhum. Texturas de largura fixa 4096 (endereço por
 * & e >>, sem divisão inteira). Também: um desenho do atlas inteiro com a
 * travessia lenta passou de 2 s e o Windows REINICIOU a placa (TDR) —
 * o cálculo vai sempre em faixas medidas.
 *   nós:  RGBA32UI, 2 texels: (min.xyz em bits, pular) (max.xyz, folha)
 *         folha = 0x80000000 | quantos << 24 | 1º triângulo (0 = interno)
 *   tri:  RGBA32F, 3 texels por triângulo na ordem da árvore: (vértice.xyz, nº do vértice)
 *   atr:  RGBA32F, 2 texels por vértice: (uv2.xy, tem atlas, 0) (albedo.rgb, 0)
 * --------------------------------------------------------------------- */
const LARG = 4096;
function texDados(arr, w, h, inteiro) {
  const t = new THREE.DataTexture(arr, w, h, inteiro ? THREE.RGBAIntegerFormat : THREE.RGBAFormat, inteiro ? THREE.UnsignedIntType : THREE.FloatType);
  t.internalFormat = inteiro ? 'RGBA32UI' : 'RGBA32F'; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
  return t;
}
export function empacotarBVH(bvh, auv, alb) {
  if (bvh._roots.length !== 1) throw new Error('BVH com mais de uma raiz');
  const U = new MeshBVHUniformStruct(); U.updateFrom(bvh);
  const N = bvh._roots[0].byteLength / 32, B = U.bvhBounds.image.data, C = U.bvhContents.image.data;
  const pular = new Uint32Array(N); pular[0] = N;
  const pilha = [0];
  while (pilha.length) {
    const n = pilha.pop(), c0 = C[2 * n];
    if ((c0 & 0xffff0000) >>> 0) continue;
    const L = n + 1, R = n + C[2 * n + 1];
    pular[L] = R; pular[R] = pular[n]; pilha.push(L, R);
  }
  const hN = Math.ceil(2 * N / LARG), nos = new Uint32Array(LARG * hN * 4), nf = new Float32Array(nos.buffer);
  let maxFolha = 0;
  for (let n = 0; n < N; n++) {
    const o = 8 * n, c0 = C[2 * n];
    nf[o] = B[8 * n]; nf[o + 1] = B[8 * n + 1]; nf[o + 2] = B[8 * n + 2]; nos[o + 3] = pular[n];
    nf[o + 4] = B[8 * n + 4]; nf[o + 5] = B[8 * n + 5]; nf[o + 6] = B[8 * n + 6];
    if ((c0 & 0xffff0000) >>> 0) {
      const q = c0 & 0xffff, off = C[2 * n + 1];
      if (q > 127 || off >= 16777216) throw new Error('folha da árvore grande demais (' + q + ' triângulos)');
      maxFolha = Math.max(maxFolha, q);
      nos[o + 7] = (0x80000000 | (q << 24) | off) >>> 0;
    } else nos[o + 7] = 0;
  }
  U.dispose();
  const P = bvh.geometry.attributes.position.array, ix = bvh.geometry.index.array, T = ix.length / 3, hT = Math.ceil(3 * T / LARG), tri = new Float32Array(LARG * hT * 4);
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const v = ix[3 * t + k], o = (3 * t + k) * 4; tri[o] = P[3 * v]; tri[o + 1] = P[3 * v + 1]; tri[o + 2] = P[3 * v + 2]; tri[o + 3] = v; }
  const V = auv.length / 4, hA = Math.ceil(2 * V / LARG), atr = new Float32Array(LARG * hA * 4);
  for (let i = 0; i < V; i++) { atr.set(auv.subarray(4 * i, 4 * i + 4), 8 * i); atr.set(alb.subarray(4 * i, 4 * i + 4), 8 * i + 4); }
  return { nos: texDados(nos, LARG, hN, true), tri: texDados(tri, LARG, hT), atr: texDados(atr, LARG, hA), total: N, maxFolha, mb: Math.round((nos.byteLength + tri.byteLength + atr.byteLength) / 1048576) };
}

/* ---------------------------------------------------------------------
 * OS SHADERS (GLSL 3, WebGL2)
 * --------------------------------------------------------------------- */
const VS_QUAD = 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }';

/* G-buffer do atlas: a malha desenhada no espaço da UV2 */
const VS_RASTER = `
in vec2 uv1;
out vec3 vPos; out vec3 vNor;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPos = w.xyz; vNor = mat3(modelMatrix) * normal;
  gl_Position = vec4(uv1 * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS_RASTER = `
in vec3 vPos; in vec3 vNor;
uniform float uTexel;
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oNor;
void main() {
  float l = length(vNor);
  oPos = vec4(vPos, 1.0);
  oNor = vec4(l > 1e-6 ? vNor / l : vec3(0.0, 1.0, 0.0), uTexel);
}`;

/* uma amostra por texel: o raio do hemisfério e o que ele traz (máquina de estados com UMA chamada do BVH:
   o compilador de shader do Direct3D leva minutos com a travessia repetida em 4 lugares) */
const GLSL_RAIO = `
uniform highp usampler2D bNos;
uniform highp sampler2D bTri, bAtr;
uniform int bTotal;
uvec4 noB(uint i) { return texelFetch(bNos, ivec2(int(i & 4095u), int(i >> 12u)), 0); }
vec4 triB(uint i) { return texelFetch(bTri, ivec2(int(i & 4095u), int(i >> 12u)), 0); }
vec4 atrB(uint i) { return texelFetch(bAtr, ivec2(int(i & 4095u), int(i >> 12u)), 0); }
/* o acerto mais próximo antes de tmax; qualquer = o primeiro que achar (raio de sombra). fn aponta para quem lançou; lado > 0 = frente.
   [frente E] VIDRO (atr.w = 1 no 1º texel do vértice): não para o raio — a FRENTE dele filtra pela cor (2º texel), como o raio
   de sombra do path tracer (attenuateHit: "só na entrada"). tv = o filtro de todo vidro antes do acerto (até 4 por raio). */
bool raio(vec3 ro, vec3 rd, bool qualquer, float tmax, out uvec3 vi, out vec3 bc, out vec3 fn, out float lado, out float dist, out vec3 tv) {
  vec3 inv = 1.0 / rd;
  uint n = 0u, total = uint(bTotal);
  float melhor = tmax; bool achou = false;
  vec4 g0 = vec4(1.0, 1.0, 1.0, 1e30), g1 = g0, g2 = g0, g3 = g0; int ng = 0;
  vi = uvec3(0u); bc = vec3(0.0); fn = vec3(0.0); lado = 0.0; dist = 0.0; tv = vec3(1.0);
  while (n < total) {
    uvec4 a = noB(2u * n), b = noB(2u * n + 1u);
    vec3 t0 = inv * (uintBitsToFloat(a.xyz) - ro), t1 = inv * (uintBitsToFloat(b.xyz) - ro);
    vec3 tn = min(t0, t1), tf = max(t0, t1);
    float dn = max(max(tn.x, tn.y), max(tn.z, 0.0)), df = min(min(tf.x, tf.y), tf.z);
    if (df < dn || dn > melhor) { n = a.w; continue; }
    if (b.w < 0x80000000u) { n = n + 1u; continue; }
    uint q = (b.w >> 24u) & 127u, off = b.w & 0xffffffu;
    for (uint k = 0u; k < q; k++) {
      uint t = (off + k) * 3u;
      vec4 A = triB(t), B = triB(t + 1u), C = triB(t + 2u);
      vec3 e1 = B.xyz - A.xyz, e2 = C.xyz - A.xyz, nn = cross(e1, e2);
      float det = -dot(rd, nn);
      if (abs(det) < 1e-14) continue;
      float iv = 1.0 / det; vec3 ao = ro - A.xyz, dao = cross(ao, rd);
      float u = dot(e2, dao) * iv, v = -dot(e1, dao) * iv, d = dot(ao, nn) * iv, w = 1.0 - u - v;
      if (u < -1e-5 || v < -1e-5 || w < -1e-5 || d < 0.0 || d >= melhor) continue;
      if (atrB(2u * uint(A.w)).w > 0.5) {
        if (det > 0.0) {
          vec4 gv = vec4(atrB(2u * uint(A.w) + 1u).rgb, d);
          if (ng == 0) g0 = gv; else if (ng == 1) g1 = gv; else if (ng == 2) g2 = gv; else if (ng == 3) g3 = gv;
          ng++;
        }
        continue;
      }
      melhor = d; achou = true; dist = d; lado = sign(det); fn = lado * normalize(nn); bc = vec3(w, u, v);
      vi = uvec3(uint(A.w), uint(B.w), uint(C.w));
      if (qualquer) return true;
    }
    n = a.w;
  }
  if (ng > 0) {
    if (g0.w < melhor) tv *= g0.rgb;
    if (g1.w < melhor) tv *= g1.rgb;
    if (g2.w < melhor) tv *= g2.rgb;
    if (g3.w < melhor) tv *= g3.rgb;
  }
  return achou;
}
vec4 uvAcerto(uvec3 vi, vec3 bc) { return bc.x * atrB(2u * vi.x) + bc.y * atrB(2u * vi.y) + bc.z * atrB(2u * vi.z); }
vec3 albAcerto(uvec3 vi) { return atrB(2u * vi.x + 1u).rgb; }
`;
const FS_ASSAR = `
#define PI 3.141592653589793
${GLSL_RAIO}
${GLSL_LUMINARIAS}
uniform sampler2D uPos, uNor, uPrev, uCeu;
uniform vec3 uSolDir, uSolE;
uniform float uTemSol, uAmostra, uSemente, uVersoDist, uEps, uModo;
uniform int uPassos;
layout(location = 0) out vec4 oL;
layout(location = 1) out vec4 oAux;

uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd(inout uint s) { s = pcg(s); return float(s >> 8u) / 16777216.0; }
/* [frente E2] a DIRETA DAS LUMINÁRIAS num ponto que o rebote atingiu e que NÃO tem atlas (ripado que saiu por fino, móvel,
   louça, terreno) ou foi atingido pelo verso: uma luz sorteada pelo peso (como no FS_LUM) + o raio de sombra. Sem isto a
   luz das luminárias que bate nessas peças e volta para a parede sumia: no bar do Quiosque à noite o ripado de madeira
   (fora do atlas) é metade do que a parede vê e ela saía ~0,5× a foto física (21/10/2026). */
vec3 lumDireta(vec3 P, vec3 N, inout uint sem) {
  if (uNLuz <= 0) return vec3(0.0);
  /* UM laço só (amostragem por reservatório): cada luz entra com o peso dela e substitui a escolhida com chance w/soma —
     o mesmo sorteio do FS_LUM pela metade do custo (o rebote chama isto em todo ponto sem atlas) */
  vec3 ref; float soma = 0.0, wj = 0.0; int j = -1;
  for (int i = 0; i < uNLuz; i++) {
    float w = luzPeso(luzE(i, P, N, vec2(0.5), true, ref));
    if (w <= 0.0) continue;
    soma += w;
    if (rnd(sem) * soma <= w) { j = i; wj = w; }
  }
  if (j < 0 || !(soma > 0.0)) return vec3(0.0);
  float pj = wj / soma;
  vec3 Ej = luzE(j, P, N, vec2(rnd(sem), rnd(sem)), false, ref);
  vec3 ro = P + N * uEps, t = ref - ro; float dd = length(t);
  uvec3 vi2; vec3 bc2, fn2, tv2; float lado2, dist2;
  if (luzPeso(Ej) > 0.0 && dd > 0.003 && !raio(ro, t / dd, true, dd - 0.002, vi2, bc2, fn2, lado2, dist2, tv2)) return Ej / pj * tv2;
  return vec3(0.0);
}
vec3 ceuL(vec3 d) {
  vec2 uv = vec2(atan(d.z, d.x) * (0.5 / PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  return textureLod(uCeu, uv, 0.0).rgb;
}
vec3 hemisferio(vec3 n, vec2 u) {
  vec3 t = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(n, t);
  float r = sqrt(u.x), f = 2.0 * PI * u.y;
  return normalize(t * (r * cos(f)) + b * (r * sin(f)) + n * sqrt(max(0.0, 1.0 - u.x)));
}
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(uPos, ij, 0);
  if (P.w < 0.5) discard;
  vec3 N = normalize(texelFetch(uNor, ij, 0).xyz);
  uint sem = pcg(uint(ij.x) * 1973u + uint(ij.y) * 9277u + uint(uSemente) * 26699u) | 1u;
  /* sequência R2 (baixa discrepância) girada por texel: converge mais rápido que o acaso puro */
  vec2 rot = vec2(rnd(sem), rnd(sem));
  vec2 u1 = fract(rot + uAmostra * vec2(0.7548776662, 0.5698402910));
  vec3 ro = P.xyz + N * uEps, rd = hemisferio(N, u1);
  vec3 Ed1 = vec3(0.0);
  vec3 L = vec3(0.0), p1 = vec3(0.0), n1 = vec3(0.0), a1 = vec3(0.0), E1 = vec3(0.0), a2 = vec3(0.0), E2 = vec3(0.0);
  vec3 tv = vec3(1.0), t0v = vec3(1.0), t2v = vec3(1.0), s1 = vec3(0.0);   /* [frente E] o filtro do vidro em cada trecho */
  float verso = 0.0, ceu = 0.0, cs1 = 0.0, cs2 = 0.0;
  bool acertou = false, precisa = false;
  uvec3 vi = uvec3(0u); vec3 fn = vec3(0.0), bc = vec3(0.0); float lado = 0.0, dist = 0.0;
  int st = 0;
  /* ⚠ limite do laço por UNIFORME e textureLod (sem derivada): com "it < 4" e texture() dentro, o compilador do
     Direct3D desenrola o laço e copia a travessia do BVH 4 vezes (shader enorme, placa lenta — 20/10/2026) */
  for (int it = 0; it < uPassos; it++) {
    if (st >= 4 || (uModo > 0.5 && st > 0)) break;
    bool h = uModo > 1.5 ? false : raio(ro, rd, st == 1 || st == 3, 1e20, vi, bc, fn, lado, dist, tv);
    if (st == 0) {
      if (!h) { L = ceuL(rd) * tv; ceu = 1.0; st = 4; continue; }
      acertou = true; p1 = ro + rd * dist; n1 = fn; t0v = tv;
      a1 = albAcerto(vi);
      vec4 at = uvAcerto(vi, bc);
      /* "dentro da parede" = verso PERTO de superfície da obra (com atlas). Verso de folha, flor, louça (sem atlas) não
         conta: o reboco atrás do jardim vertical virava inválido e herdava luz de outro pedaço do atlas (20/10/2026) */
      if (lado < 0.0 && dist < uVersoDist && at.z > 0.5) verso = 1.0;
      precisa = !(lado > 0.0 && at.z > 0.5);
      if (!precisa) E1 = max(textureLod(uPrev, at.xy, 0.0).rgb, vec3(0.0)) * 1000.0;
      else Ed1 = lumDireta(p1, n1, sem);   /* [frente E2] o atlas de quem tem atlas já leva a direta das luminárias */
      cs1 = dot(n1, uSolDir);
      if (uTemSol > 0.5 && cs1 > 0.0) { st = 1; ro = p1 + n1 * uEps; rd = uSolDir; }
      else if (precisa) { st = 2; ro = p1 + n1 * uEps; rd = hemisferio(n1, vec2(rnd(sem), rnd(sem))); }
      else st = 4;
    } else if (st == 1) {
      if (!h) s1 = cs1 * tv;
      if (precisa) { st = 2; ro = p1 + n1 * uEps; rd = hemisferio(n1, vec2(rnd(sem), rnd(sem))); }
      else st = 4;
    } else if (st == 2) {
      if (!h) { E1 = PI * ceuL(rd) * tv; st = 4; }
      else {
        vec3 p2 = ro + rd * dist, n2 = fn; t2v = tv;
        a2 = albAcerto(vi);
        vec4 at2 = uvAcerto(vi, bc);
        E2 = (lado > 0.0 && at2.z > 0.5) ? max(textureLod(uPrev, at2.xy, 0.0).rgb, vec3(0.0)) * 1000.0 : vec3(0.0);
        cs2 = dot(n2, uSolDir);
        if (uTemSol > 0.5 && cs2 > 0.0) { st = 3; ro = p2 + n2 * uEps; rd = uSolDir; }
        else { E1 = a2 * E2 * t2v; st = 4; }
      }
    } else {
      E1 = a2 * ((h ? vec3(0.0) : cs2 * tv) * uSolE + E2) * t2v; st = 4;
    }
  }
  if (acertou) L = a1 / PI * (s1 * uSolE + E1 + Ed1) * t0v;
  oL = vec4(L * 0.001, 1.0);
  oAux = vec4(verso, ceu, 0.0, 0.0);
}`;

/* soma → irradiância (klux) e céu visível; texel dentro da parede (verso perto) ou vazio → −1 */
const FS_RESOLVER = `
#define PI 3.141592653589793
uniform sampler2D uAcc, uAux, uPos;
uniform float uVersoMax;
out vec4 o;
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uAcc, ij, 0), x = texelFetch(uAux, ij, 0);
  if (texelFetch(uPos, ij, 0).w < 0.5 || a.w < 0.5 || x.x / a.w > uVersoMax) { o = vec4(0.0, 0.0, 0.0, -1.0); return; }
  o = vec4(PI * a.rgb / a.w, x.y / a.w);
}`;

/* AS LUMINÁRIAS (js/bimluzluminarias.js): por texel e por amostra, UMA luz sorteada com peso = a luz que ela daria ali sem
   sombra (a do cômodo pesa muito, a do outro lado da casa quase nada), um ponto sorteado nela e o raio de sombra até lá.
   E = E_luz / p_luz (estimador sem viés). Não depende da hora: é calculado antes das passadas e somado em cada uma (a
   "luz que chega" dos rebotes já leva a direta das luminárias). [frente E, 20/10/2026] */
const FS_LUM = `
#define PI 3.141592653589793
${GLSL_RAIO}
${GLSL_LUMINARIAS}
uniform sampler2D uPos, uNor;
uniform float uAmostra, uSemente, uEps;
layout(location = 0) out vec4 oL;
layout(location = 1) out vec4 oAux;
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd(inout uint s) { s = pcg(s); return float(s >> 8u) / 16777216.0; }
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(uPos, ij, 0);
  if (P.w < 0.5) discard;
  vec3 N = normalize(texelFetch(uNor, ij, 0).xyz), ref;
  uint sem = pcg(uint(ij.x) * 2087u + uint(ij.y) * 7919u + uint(uSemente) * 31337u) | 1u;
  vec2 rot = vec2(rnd(sem), rnd(sem));
  vec2 u1 = fract(rot + uAmostra * vec2(0.7548776662, 0.5698402910));
  float soma = 0.0;
  for (int i = 0; i < uNLuz; i++) soma += luzPeso(luzE(i, P.xyz, N, vec2(0.5), true, ref));
  vec3 E = vec3(0.0);
  if (soma > 0.0) {
    float alvo = rnd(sem) * soma, acc = 0.0, pj = 0.0; int j = -1;
    for (int i = 0; i < uNLuz; i++) { float w = luzPeso(luzE(i, P.xyz, N, vec2(0.5), true, ref)); acc += w; if (w > 0.0 && acc >= alvo) { j = i; pj = w / soma; break; } }
    if (j >= 0) {
      vec3 Ej = luzE(j, P.xyz, N, u1, false, ref);
      vec3 ro = P.xyz + N * uEps, t = ref - ro; float dd = length(t);
      uvec3 vi; vec3 bc, fn, tv; float lado, dist;
      if (luzPeso(Ej) > 0.0 && dd > 0.003 && !raio(ro, t / dd, true, dd - 0.002, vi, bc, fn, lado, dist, tv)) E = Ej / pj * tv;
    }
  }
  oL = vec4(E * 0.001, 1.0);
  oAux = vec4(0.0);
}`;
/* a soma das amostras das luminárias → klux (sem o π: já é irradiância); sem dado → −1 */
const FS_RESOLVER_LUM = `
uniform sampler2D uAcc, uPos;
out vec4 o;
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uAcc, ij, 0);
  o = (texelFetch(uPos, ij, 0).w < 0.5 || a.w < 0.5) ? vec4(0.0, 0.0, 0.0, -1.0) : vec4(a.rgb / a.w, 0.0);
}`;
/* a passada (céu + rebotes, já limpa) + a direta das luminárias; o texel inválido continua inválido (a dilatação preenche) */
const FS_SOMAR = `
uniform sampler2D uSrc, uLum;
out vec4 o;
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uSrc, ij, 0);
  if (c.a < -0.5) { o = c; return; }
  vec4 l = texelFetch(uLum, ij, 0);
  o = vec4(c.rgb + (l.a < -0.5 ? vec3(0.0) : l.rgb), c.a);
}`;

/* LIMPEZA DE RUÍDO à-trous 5×5 (Dammertz et al. 2010) guiada por normal, plano e distância no mundo */
const FS_ATROUS = `
uniform sampler2D uSrc, uPos, uNor;
uniform float uPasso;
out vec4 o;
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy), tam = textureSize(uSrc, 0);
  vec4 c = texelFetch(uSrc, ij, 0);
  if (c.a < -0.5) { o = c; return; }
  vec3 P = texelFetch(uPos, ij, 0).xyz; vec4 Nt = texelFetch(uNor, ij, 0); vec3 N = Nt.xyz; float tw = max(Nt.w, 1e-4);
  float k[5] = float[5](0.0625, 0.25, 0.375, 0.25, 0.0625);
  int ps = int(uPasso);
  vec4 s = vec4(0.0); float ws = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    ivec2 q = ij + ivec2(i, j) * ps;
    if (q.x < 0 || q.y < 0 || q.x >= tam.x || q.y >= tam.y) continue;
    vec4 cq = texelFetch(uSrc, q, 0); if (cq.a < -0.5) continue;
    vec3 Pq = texelFetch(uPos, q, 0).xyz, Nq = texelFetch(uNor, q, 0).xyz;
    float wn = pow(max(dot(N, Nq), 0.0), 32.0);
    float dpl = abs(dot(Pq - P, N)) / tw;
    float esp = tw * uPasso * length(vec2(float(i), float(j)));
    float wd = length(Pq - P) > 2.0 * esp + 1.5 * tw ? 0.0 : 1.0;
    float w = k[i + 2] * k[j + 2] * wn * exp(-0.5 * dpl * dpl) * wd;
    s += cq * w; ws += w;
  }
  o = ws > 0.0 ? s / ws : c;
}`;

/* DILATAÇÃO: o texel sem dado herda a média dos vizinhos válidos (a costura e o pé da parede).
   ⚠ Texel COBERTO (é superfície, só ficou inválido) só herda da MESMA superfície: vizinho perto no mundo e de normal
   parecida. Sem isso o vizinho do ATLAS — outro pedaço qualquer, até uma parede externa ao sol — entrava: a coluna
   atrás do jardim vertical saiu com 17 klux numa sala de ~2 klux (20/10/2026). O texel vazio (margem) herda de quem for. */
const FS_DILATAR = `
uniform sampler2D uSrc, uPos, uNor;
out vec4 o;
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy), tam = textureSize(uSrc, 0);
  vec4 c = texelFetch(uSrc, ij, 0);
  if (c.a > -0.5) { o = c; return; }
  vec4 P = texelFetch(uPos, ij, 0); vec4 Nt = texelFetch(uNor, ij, 0);
  bool coberto = P.w > 0.5; float lim = 2.5 * max(Nt.w, 1e-4);
  vec4 s = vec4(0.0); float n = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 q = ij + ivec2(i, j);
    if (q.x < 0 || q.y < 0 || q.x >= tam.x || q.y >= tam.y) continue;
    vec4 cq = texelFetch(uSrc, q, 0); if (cq.a < -0.5) continue;
    if (coberto) {
      vec4 Pq = texelFetch(uPos, q, 0);
      if (Pq.w < 0.5 || length(Pq.xyz - P.xyz) > lim || dot(texelFetch(uNor, q, 0).xyz, Nt.xyz) < 0.7) continue;
    }
    s += cq; n += 1.0;
  }
  o = n > 0.0 ? s / n : c;
}`;

const FS_COPIAR = `
uniform sampler2D uSrc;
out vec4 o;
void main() { o = texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0); }`;

function matTela(fs, uniforms, extra) {
  return new THREE.ShaderMaterial(Object.assign({ glslVersion: THREE.GLSL3, vertexShader: VS_QUAD, fragmentShader: fs, uniforms,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false }, extra || {}));
}
function alvo(w, h, tipo, n) {
  const rt = new THREE.WebGLRenderTarget(w, h, { count: n || 1, type: tipo, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false, colorSpace: THREE.NoColorSpace });
  return rt;
}
const quadro = () => new Promise((r) => requestAnimationFrame(() => r()));

/* =====================================================================
 * O ASSADOR
 * ===================================================================== */
export class LuzAssada {
  constructor(qualidade) {
    this.esq = ESQUEMAS[qualidade] || ESQUEMAS.alta;
    this.sel = null; this.uv = null; this.r = null; this.info = {};
  }

  /* 1. quem entra + a UV2 (antes do 1º quadro do tempo real) */
  async prepararUV(scene) {
    const t0 = performance.now();
    this.sel = selecionar(scene, this.esq);
    if (!this.sel.lm.length) return null;
    const r = await abrirUV(this.sel.lm, this.esq);
    this.uv = aplicarUV(this.sel.lm, r);
    this.uv.msTotal = Math.round(performance.now() - t0);
    this.uv.area = Math.round(this.sel.lm.reduce((s, e) => s + e.area, 0));
    this.uv.malhasFora = this.sel.fora.length;
    /* [frente E] por que saiu (terreno, fina, densa…) e o texel que ficou (cm) — a régua do "Leve ≤ 10 cm" */
    this.uv.fora = this.sel.fora.reduce((s, f) => { s[f[1]] = (s[f[1]] || 0) + 1; return s; }, {});
    this.uv.cm = Math.round(this.uv.texel * 1000) / 10;
    return this.uv;
  }

  /* 2. o contexto WebGL2 e o que não muda com a hora: BVH, atributos, G-buffer do atlas */
  _montar() {
    if (this.r) return;
    const t0 = performance.now();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.autoClear = false; r.outputColorSpace = THREE.LinearSRGBColorSpace; r.toneMapping = THREE.NoToneMapping;
    const gl = r.getContext();
    if (!r.extensions.get('EXT_color_buffer_float')) throw new Error('a placa não grava cor em ponto flutuante (EXT_color_buffer_float)');
    if (!r.extensions.get('EXT_float_blend')) throw new Error('a placa não soma em ponto flutuante (EXT_float_blend)');
    this._tq = r.extensions.get('EXT_disjoint_timer_query_webgl2');
    this._perdido = false; canvas.addEventListener('webglcontextlost', () => { this._perdido = true; });

    /* a geometria dos raios: TODO o opaco (com o terreno e os miúdos), por vértice a UV2 (ou −1) e o albedo */
    /* [frente E] + o vidro (filtro nos raios; window.__luzSemVidro = true desliga, para comparar) */
    const semVidro = typeof window !== 'undefined' && !!window.__luzSemVidro;
    const ocl = this.sel.ocl.concat(semVidro ? [] : (this.sel.vid || []));
    this.info.vidros = semVidro ? 0 : (this.sel.vid || []).length;
    let nv = 0, ni = 0;
    ocl.forEach((o) => { const g = o.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
    const pos = new Float32Array(nv * 3), auv = new Float32Array(nv * 4), alb = new Float32Array(nv * 4), idx = new Uint32Array(ni), v = new THREE.Vector3();
    let ov = 0, oi = 0;
    ocl.forEach((o) => {
      const g = o.geometry, p = g.attributes.position, u1 = o.userData.lmTexel ? g.getAttribute('uv1') : null, M = o.matrixWorld;
      const vidro = o.material.transmission > 0, c = o.material.color;
      const a = vidro ? [c ? c.r : 1, c ? c.g : 1, c ? c.b : 1] : (o.userData.espelho || (o.material.userData && o.material.userData.id === 'espelho')) ? [0.7, 0.7, 0.7] : albedoDe(o.material);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(M); const k = ov + i;
        pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
        auv[k * 4] = u1 ? u1.getX(i) : -1; auv[k * 4 + 1] = u1 ? u1.getY(i) : -1; auv[k * 4 + 2] = u1 ? 1 : 0; auv[k * 4 + 3] = vidro ? 1 : 0;
        alb[k * 4] = a[0]; alb[k * 4 + 1] = a[1]; alb[k * 4 + 2] = a[2]; alb[k * 4 + 3] = 1;
      }
      const ix = g.index, n = ix ? ix.count : p.count;
      for (let k = 0; k < n; k++) idx[oi + k] = (ix ? ix.getX(k) : k) + ov;
      ov += p.count; oi += n;
    });
    const sub = this.esq.arestaMax ? subdividir(pos, auv, alb, idx, this.esq.arestaMax) : { pos, auv, alb, idx };
    this.info.triangulosOriginais = ni / 3;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(sub.pos, 3)); geo.setIndex(new THREE.BufferAttribute(sub.idx, 1));
    const bvh = this._bvh = new MeshBVH(geo, { strategy: SAH, targetLeafSize: 2, maxDepth: 40 });
    this.bvhT = empacotarBVH(bvh, sub.auv, sub.alb);
    this.info.triangulos = sub.idx.length / 3; this.info.nos = this.bvhT.total; this.info.mbArvore = this.bvhT.mb; this.info.msBVH = Math.round(performance.now() - t0);

    /* a tela cheia e a câmera (o vértice já sai em coordenada de recorte) */
    const qg = new THREE.BufferGeometry(); qg.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    this._quad = new THREE.Mesh(qg); this._quad.frustumCulled = false; this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    /* a cena do G-buffer (as MESMAS BufferAttribute do tempo real — cada renderizador guarda a sua cópia na placa) */
    const mr = this._mRaster = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS_RASTER, fragmentShader: FS_RASTER, uniforms: { uTexel: { value: 0.03 } },
      side: THREE.DoubleSide, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    const cena = this._cenaRaster = new THREE.Scene(); this._matsRaster = [];
    this.sel.lm.forEach((e) => {
      const m = mr.clone(); m.uniforms.uTexel.value = e.mesh.userData.lmTexel; this._matsRaster.push(m);
      const g = new THREE.BufferGeometry(); ['position', 'normal', 'uv1'].forEach((k) => g.setAttribute(k, e.mesh.geometry.getAttribute(k))); g.setIndex(e.mesh.geometry.index);
      const ms = new THREE.Mesh(g, m); ms.frustumCulled = false; ms.matrixAutoUpdate = false; ms.matrix.copy(e.mesh.matrixWorld); ms.matrixWorld.copy(e.mesh.matrixWorld); cena.add(ms);
    });
    this.W = this.uv.largura; this.H = this.uv.altura;
    this.mAssar = matTela(FS_ASSAR, {
      bNos: { value: this.bvhT.nos }, bTri: { value: this.bvhT.tri }, bAtr: { value: this.bvhT.atr }, bTotal: { value: this.bvhT.total },
      uPos: { value: null }, uNor: { value: null }, uPrev: { value: null }, uCeu: { value: null }, uSolDir: { value: new THREE.Vector3(0, 1, 0) }, uSolE: { value: new THREE.Vector3() },
      uTemSol: { value: 0 }, uAmostra: { value: 0 }, uSemente: { value: 0 }, uVersoDist: { value: VERSO_DIST }, uEps: { value: EPS }, uModo: { value: 0 }, uPassos: { value: 4 },
      uLuz: { value: null }, uNLuz: { value: 0 }   /* [frente E2] as luminárias também no ponto sem atlas do rebote */
    }, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
    this.mResolver = matTela(FS_RESOLVER, { uAcc: { value: null }, uAux: { value: null }, uPos: { value: null }, uVersoMax: { value: VERSO_MAX } });
    this.mAtrous = matTela(FS_ATROUS, { uSrc: { value: null }, uPos: { value: null }, uNor: { value: null }, uPasso: { value: 1 } });
    this.mDilatar = matTela(FS_DILATAR, { uSrc: { value: null }, uPos: { value: null }, uNor: { value: null } });
    this.mCopiar = matTela(FS_COPIAR, { uSrc: { value: null } });
    /* [frente E] as luminárias: a mesma soma aditiva do céu */
    this.mLum = matTela(FS_LUM, {
      bNos: { value: this.bvhT.nos }, bTri: { value: this.bvhT.tri }, bAtr: { value: this.bvhT.atr }, bTotal: { value: this.bvhT.total },
      uPos: { value: null }, uNor: { value: null }, uLuz: { value: null }, uNLuz: { value: 0 }, uAmostra: { value: 0 }, uSemente: { value: 0 }, uEps: { value: EPS }
    }, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
    this.mResolverLum = matTela(FS_RESOLVER_LUM, { uAcc: { value: null }, uPos: { value: null } });
    this.mSomar = matTela(FS_SOMAR, { uSrc: { value: null }, uLum: { value: null } });
    this.info.msMontar = Math.round(performance.now() - t0);
    this.info.atlas = this.W + '×' + this.H; this.info.texel = Math.round(this.uv.texel * 1000) / 10;
    this.info.mbPlaca = Math.round(this.W * this.H * 8 / 1048576);
  }

  /* os alvos do tamanho do atlas (~48 bytes por texel, só durante o cálculo) + o G-buffer desenhado */
  _alvos() {
    if (this.gb) return;
    const r = this.r, W = this.W, H = this.H;
    /* G-buffer: posição (32 bits, a casa tem 25 m) + normal e tamanho do texel */
    const gb = this.gb = alvo(W, H, THREE.FloatType, 2); gb.textures[1].type = THREE.HalfFloatType;
    r.setRenderTarget(gb); r.setClearColor(0x000000, 0); r.clear(true, false, false);
    /* as arestas primeiro (cobrem o texel que a borda do triângulo só raspa), os triângulos por cima */
    this._matsRaster.forEach((m) => { m.wireframe = true; }); r.render(this._cenaRaster, this._cam);
    this._matsRaster.forEach((m) => { m.wireframe = false; }); r.render(this._cenaRaster, this._cam);
    r.setRenderTarget(null);
    /* soma das amostras (32 bits: centenas de amostras) + auxiliar (verso, céu); três de meio-float para resolver/limpar/dilatar */
    this.acc = alvo(W, H, THREE.FloatType, 2); this.acc.textures[1].type = THREE.HalfFloatType;
    this.ta = alvo(W, H, THREE.HalfFloatType); this.tb = alvo(W, H, THREE.HalfFloatType);
    this.prev = alvo(W, H, THREE.HalfFloatType); this.prev.texture.minFilter = this.prev.texture.magFilter = THREE.LinearFilter;
    this.guarda = alvo(W, H, THREE.HalfFloatType); this.guarda.texture.minFilter = this.guarda.texture.magFilter = THREE.LinearFilter;
    this.lum = alvo(W, H, THREE.HalfFloatType);   /* [frente E] a direta das luminárias (klux) */
    const ua = this.mAssar.uniforms, ur = this.mResolver.uniforms, ut = this.mAtrous.uniforms;
    const ud = this.mDilatar.uniforms, ul = this.mLum.uniforms;
    ua.uPos.value = ur.uPos.value = ut.uPos.value = ud.uPos.value = ul.uPos.value = this.mResolverLum.uniforms.uPos.value = gb.textures[0];
    ua.uNor.value = ut.uNor.value = ud.uNor.value = ul.uNor.value = gb.textures[1]; ua.uPrev.value = this.prev.texture;
    ur.uAcc.value = this.acc.textures[0]; ur.uAux.value = this.acc.textures[1];
    this.mSomar.uniforms.uLum.value = this.lum.texture;
  }

  /* [frente E] as luminárias ligadas → textura da placa (4 texels por luz); devolve quantas */
  _luzes(luzes) {
    const pac = luzesParaPlaca(luzes), u = this.mLum.uniforms, ua = this.mAssar.uniforms;
    if (this._luzTex) { this._luzTex.dispose(); this._luzTex = null; }
    if (!pac.n) { u.uNLuz.value = 0; ua.uNLuz.value = 0; if (!this._luzVazia) { const tv = this._luzVazia = new THREE.DataTexture(new Float32Array(16), 4, 1, THREE.RGBAFormat, THREE.FloatType); tv.minFilter = tv.magFilter = THREE.NearestFilter; tv.generateMipmaps = false; tv.needsUpdate = true; } ua.uLuz.value = this._luzVazia; return 0; }
    const t = this._luzTex = new THREE.DataTexture(pac.dados, pac.largura, 1, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
    u.uLuz.value = t; u.uNLuz.value = pac.n; ua.uLuz.value = t; ua.uNLuz.value = (typeof window !== 'undefined' && window.__luzSemLumRebote) ? 0 : pac.n;   /* [frente E2] __luzSemLumRebote: comparar */
    return pac.n;
  }

  _tela(mat, rt) { this._quad.material = mat; this.r.setRenderTarget(rt); this.r.render(this._quad, this._cam); }

  /* COMPILA os shaders do cálculo sem travar ninguém (KHR_parallel_shader_compile: o Direct3D compila numa thread à
     parte). ⚠ Medido 20/10/2026: compilado no 1º desenho, o shader dos raios segurava a placa ~45 s — a "rápida" levava
     52 s e o tempo real congelava junto (o processo da placa do Chrome é um só para WebGL e WebGPU). */
  async _compilar() {
    if (this._compilado) return;
    const t0 = performance.now(), cs = new THREE.Scene();
    [this.mAssar, this.mResolver, this.mAtrous, this.mDilatar, this.mCopiar, this.mLum, this.mResolverLum, this.mSomar].forEach((m) => { const ms = new THREE.Mesh(this._quad.geometry, m); ms.frustumCulled = false; cs.add(ms); });
    const rs = this._cenaRaster.children[0]; if (rs) { const ms = new THREE.Mesh(rs.geometry, rs.material); ms.frustumCulled = false; cs.add(ms); }
    await this.r.compileAsync(cs, this._cam);
    this._compilado = true; this.info.msCompilar = Math.round(performance.now() - t0);
    this.info.compilacaoParalela = !!this.r.extensions.has('KHR_parallel_shader_compile');
  }

  /* o céu (cd/m², 32 bits) e o sol da hora */
  _ceuSol(sol, ceu) {
    const u = this.mAssar.uniforms;
    if (this._ceuTex) { this._ceuTex.dispose(); this._ceuTex = null; }
    if (ceu) {
      const t = this._ceuTex = new THREE.DataTexture(ceu.dados instanceof Float32Array ? ceu.dados : new Float32Array(ceu.dados), ceu.largura, ceu.altura, THREE.RGBAFormat, THREE.FloatType);
      t.minFilter = t.magFilter = THREE.NearestFilter; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
      u.uCeu.value = t;
    } else {
      const t = this._ceuTex = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; u.uCeu.value = t;
    }
    if (sol && sol.lux > 0) {
      u.uSolDir.value.fromArray(sol.direcao).normalize();
      const c = sol.cor || [1, 1, 1]; u.uSolE.value.set(c[0] * sol.lux, c[1] * sol.lux, c[2] * sol.lux); u.uTemSol.value = 1;
    } else u.uTemSol.value = 0;
  }

  /* a passada de resolver + limpar + dilatar; o resultado fica em this.prev */
  _fecharPassada(iter) {
    this._tela(this.mResolver, this.ta);
    let a = this.ta, b = this.tb;
    for (let i = 0; i < iter; i++) { this.mAtrous.uniforms.uSrc.value = a.texture; this.mAtrous.uniforms.uPasso.value = 1 << i; this._tela(this.mAtrous, b); const t = a; a = b; b = t; }
    /* [frente E] + a direta das luminárias (depois da limpeza: o filtro forte é do rebote, não da mancha de luz) */
    if (this._comLum) { this.mSomar.uniforms.uSrc.value = a.texture; this._tela(this.mSomar, b); const t = a; a = b; b = t; }
    for (let i = 0; i < 7; i++) { this.mDilatar.uniforms.uSrc.value = a.texture; this._tela(this.mDilatar, i === 6 ? this.prev : b); const t = a; a = b; b = t; }
  }

  /* lê o atlas da placa (assíncrono: PBO + cerca) em meio-float, pronto para o WebGPU */
  async _ler(rt) {
    const r = this.r, gl = r.getContext(), W = this.W, H = this.H;
    r.setRenderTarget(rt);
    const tipo = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE), fmt = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
    const meio = tipo === gl.HALF_FLOAT && fmt === gl.RGBA;
    const n = W * H * 4, bytes = n * (meio ? 2 : 4), buf = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf); gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
    gl.readPixels(0, 0, W, H, gl.RGBA, meio ? gl.HALF_FLOAT : gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    r.setRenderTarget(null);
    for (let k = 0; k < 2000 && gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED; k++) await new Promise((res) => setTimeout(res, 8));
    gl.deleteSync(sync);
    let out;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
    if (meio) { out = new Uint16Array(n); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out); }
    else {
      const f = new Float32Array(n); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, f);
      if (typeof Float16Array !== 'undefined') out = new Uint16Array(new Float16Array(f).buffer);
      else { out = new Uint16Array(n); for (let i = 0; i < n; i++) out[i] = THREE.DataUtils.toHalfFloat(f[i]); }
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.deleteBuffer(buf);
    return { dados: out, largura: W, altura: H, texel: this.uv.texel };
  }

  /* -------------------------------------------------------------------
   * 3. O CÁLCULO: op = { sol, ceu, cancelado(), aoProgresso(f, fase), aoResultado(atlas, fase), ritmoMs() }
   * ------------------------------------------------------------------- */
  async calcular(op) {
    if (!this.uv) return null;
    const t0 = performance.now();
    this._montar();
    await this._compilar();
    if ((op.cancelado && op.cancelado()) || !this.r) return null;
    this._alvos();
    const r = this.r, gl = r.getContext(), W = this.W, H = this.H, u = this.mAssar.uniforms;
    this._ceuSol(op.sol, op.ceu);
    const nLum = this._luzes(op.luzes), sppLum = nLum ? (op.amostrasLum || this.esq.luminarias || 32) : 0;   /* [frente I] amostrasLum: o assado por comando */
    this._comLum = false;
    r.setRenderTarget(this.prev); r.setClearColor(0x000000, -1); r.clear(true, false, false); r.setRenderTarget(null);
    const pas = op.passadas || this.esq.passadas, total = pas.reduce((s, p) => s + p[0], 0) + sppLum;
    let feitas = 0, linhas = Math.max(8, Math.ceil(H / 8)), semente = 1, somadas = 0;
    const tempos = {}, cancelado = () => (op.cancelado && op.cancelado()) || this._perdido || !this.r;
    const iRapida = Math.max(0, pas.findIndex((p) => p[1] === 'rapida')), fase = (ip) => (ip <= iRapida ? 'rapida' : 'completa');
    /* O RITMO: até 2 lotes na fila da placa; o tamanho do lote (linhas do atlas) sai do tempo de placa MEDIDO
       (consulta de tempo) para caber em ~alvoMs por quadro. ⚠ A 1ª versão esperava a cerca do lote anterior a cada
       quadro e começava com 22 linhas: a rápida (1,5 s de placa) levou 52 s (20/10/2026). */
    const st = this.info.ritmo = { quadros: 0, pulos: 0, lotes: 0, msPlaca: 0, linhas: 0 };
    let voo = [];
    const colher = () => {
      voo = voo.filter((b) => {
        if (gl.clientWaitSync(b.cerca, 0, 0) === gl.TIMEOUT_EXPIRED) return true;
        gl.deleteSync(b.cerca);
        if (b.q) {
          const ok = gl.getQueryParameter(b.q, gl.QUERY_RESULT_AVAILABLE);
          if (ok) {
            const ns = gl.getParameter(this._tq.GPU_DISJOINT_EXT) ? 0 : gl.getQueryParameter(b.q, gl.QUERY_RESULT);
            if (ns > 0) { const ms = ns / 1e6, alvo = Math.round(b.linhas * b.alvoMs / Math.max(0.05, ms)); linhas = Math.max(8, Math.min(H * 8, Math.round(0.5 * linhas + 0.5 * alvo))); st.msPlaca += ms; }
            gl.deleteQuery(b.q);
          } else { (this._qPend = this._qPend || []).push(b.q); }
        } else linhas = Math.min(H * 8, Math.round(linhas * 1.2));
        return false;
      });
      /* consultas que ficaram para depois (o resultado chega um quadro depois da cerca) */
      if (this._qPend) this._qPend = this._qPend.filter((q) => { if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return true; gl.deleteQuery(q); return false; });
    };
    /* as amostras de UMA passada (mat = o shader da passada), em lotes de linhas no ritmo medido; false = cancelado */
    const amostrar = async (mat, spp, base, nomeFase) => {
      const um = mat.uniforms;
      let amostra = 0, y = 0;
      while (amostra < spp) {
        await quadro();
        if (cancelado()) return false;
        st.quadros++;
        colher();
        if (voo.length >= 2) { st.pulos++; if (!this._tq) linhas = Math.max(8, Math.floor(linhas * 0.85)); continue; }
        const alvoMs = op.ritmoMs ? op.ritmoMs(nomeFase) : 8;
        const q = this._tq ? gl.createQuery() : null; if (q) gl.beginQuery(this._tq.TIME_ELAPSED_EXT, q);
        let resta = linhas, feitasLote = 0;
        while (resta > 0 && amostra < spp) {
          const h = Math.min(resta, H - y);
          um.uAmostra.value = base + amostra; um.uSemente.value = semente + amostra * 7919;
          this.acc.viewport.set(0, y, W, h); this.acc.scissor.set(0, y, W, h); this.acc.scissorTest = true;
          this._tela(mat, this.acc);
          resta -= h; feitasLote += h; y += h;
          if (y >= H) { y = 0; amostra++; feitas++; }
        }
        this.acc.viewport.set(0, 0, W, H); this.acc.scissor.set(0, 0, W, H); this.acc.scissorTest = false;
        r.setRenderTarget(null);
        if (q) gl.endQuery(this._tq.TIME_ELAPSED_EXT);
        voo.push({ cerca: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), q, linhas: feitasLote, alvoMs });
        gl.flush();
        st.lotes++; st.linhas += feitasLote;
        if (op.aoProgresso) { try { op.aoProgresso((feitas + y / H) / total, nomeFase); } catch (e) { /* a tela não derruba o cálculo */ } }
      }
      return true;
    };
    try {
    /* [frente E] AS LUMINÁRIAS primeiro (a direta delas não depende da hora): resolvida, limpa de leve (2 voltas do à-trous:
       a mancha de luz do spot tem borda — o filtro forte das passadas a borraria) e guardada em this.lum */
    this.info.luminarias = nLum;
    if (nLum) {
      const t1 = performance.now();
      r.setRenderTarget(this.acc); r.setClearColor(0x000000, 0); r.clear(true, false, false);
      if (!(await amostrar(this.mLum, sppLum, 0, 'rapida'))) return null;
      semente += 104729;
      this.mResolverLum.uniforms.uAcc.value = this.acc.textures[0];
      this._tela(this.mResolverLum, this.ta);
      let a = this.ta, b = this.tb;
      for (let i = 0; i < 2; i++) { this.mAtrous.uniforms.uSrc.value = a.texture; this.mAtrous.uniforms.uPasso.value = 1 << i; this._tela(this.mAtrous, b); const t = a; a = b; b = t; }
      this.mCopiar.uniforms.uSrc.value = a.texture; this._tela(this.mCopiar, this.lum); r.setRenderTarget(null);
      this._comLum = true; this.info.msLuminarias = Math.round(performance.now() - t1); this.info.amostrasLuminarias = sppLum;
    }
    for (let ip = 0; ip < pas.length; ip++) {
      const [spp, marco, o3] = pas[ip], po = o3 || {};
      if (!po.continuar) { r.setRenderTarget(this.acc); r.setClearColor(0x000000, 0); r.clear(true, false, false); somadas = 0; }
      u.uPrev.value = po.ler ? this.guarda.texture : this.prev.texture;
      if (!(await amostrar(this.mAssar, spp, somadas, fase(ip)))) return null;
      semente += 104729; somadas += spp;
      /* fim da passada: resolver, limpar o ruído (mais forte com poucas amostras) e dilatar → vira a "luz que chega" da próxima */
      this._fecharPassada(somadas >= 256 ? 3 : 4);
      if (po.guardar) { this.mCopiar.uniforms.uSrc.value = this.prev.texture; this._tela(this.mCopiar, this.guarda); r.setRenderTarget(null); }
      if (marco) {
        const atlas = await this._ler(this.prev);
        if (cancelado()) return null;
        tempos[marco] = Math.round(performance.now() - t0);
        atlas.fase = marco; atlas.amostras = feitas; atlas.ms = tempos[marco];
        if (op.aoResultado) { try { op.aoResultado(atlas, marco); } catch (e) { try { console.warn('luz assada:', e); } catch (x) { /* sem console */ } } }
      }
    }
    } finally {
      if (this.r) { voo.forEach((b) => { gl.deleteSync(b.cerca); if (b.q) gl.deleteQuery(b.q); }); (this._qPend || []).forEach((q) => gl.deleteQuery(q)); this._qPend = null; }
    }
    st.msPlaca = Math.round(st.msPlaca); st.linhasPorLote = Math.round(st.linhas / Math.max(1, st.lotes));
    this.info.tempos = tempos; this.info.amostras = total; this.info.msTotal = Math.round(performance.now() - t0);
    this.aliviar();
    return this.info;
  }

  /* solta a memória grande da placa (os alvos do atlas); o contexto, o BVH e a cena do G-buffer ficam para a próxima hora */
  aliviar() {
    ['gb', 'acc', 'ta', 'tb', 'prev', 'guarda', 'lum'].forEach((k) => { if (this[k]) { this[k].dispose(); this[k] = null; } });
  }
  descartar() {
    try {
      this.aliviar();
      ['mAssar', 'mResolver', 'mAtrous', 'mDilatar', 'mCopiar', 'mLum', 'mResolverLum', 'mSomar', '_mRaster', '_luzTex', '_luzVazia'].forEach((k) => { if (this[k]) { this[k].dispose(); this[k] = null; } });
      (this._matsRaster || []).forEach((m) => m.dispose()); this._matsRaster = null;
      if (this._cenaRaster) { this._cenaRaster.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); this._cenaRaster = null; }
      if (this.bvhT) { this.bvhT.nos.dispose(); this.bvhT.tri.dispose(); this.bvhT.atr.dispose(); }
      if (this._ceuTex) this._ceuTex.dispose();
      if (this._quad) this._quad.geometry.dispose();
      if (this.r) { this.r.dispose(); this.r.forceContextLoss(); }
    } catch (e) { /* já descartado */ }
    this.r = null; this.sel = null; this.bvhT = null; this._bvh = null; this._ceuTex = null; this._quad = null;
  }
}

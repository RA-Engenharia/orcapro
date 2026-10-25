/* =====================================================================
 * bimverso.js — O VERSO SÓ ONDE IMPORTA (módulo ES, frente E2 do render
 * ao vivo, 21/10/2026; usado pelo js/bimrendervivo.js)
 *
 * O problema: o tempo real desenha o opaco SÓ DE FRENTE (FrontSide — o
 * padrão de todo motor de jogo, metade do trabalho de rasterização) e a
 * foto física (path tracer) trata toda face como opaca DOS DOIS LADOS.
 * Onde a obra é um SÓLIDO FECHADO (parede com as duas faces, laje, pilar)
 * isso não muda nada: o verso fica sempre dentro do sólido. Mas onde a
 * superfície é ABERTA — parede que veio do IFC só com a face de fora,
 * película de acabamento, telhado de um lado só, folha de planta — o
 * tempo real ATRAVESSA: no estar da Casa 487 a parede leste (só a face de
 * fora, em x = 4,83) sumia e a sala via o jardim através dela; na régua
 * da luz 9 de 25 pontos comparavam superfícies diferentes (medido
 * 21/10/2026: a física batia no verso a ~2 m, o tempo real 0,85 m além).
 *
 * A decisão (frente E2): desenhar o verso SÓ das peças abertas. Por malha,
 * os triângulos são agrupados em peças (vértices soldados a 0,1 mm); a
 * peça com ARESTA DE BORDA (aresta de um triângulo só) é aberta e ganha
 * uma cópia com o enrolamento e a normal invertidos. O sólido fechado não
 * ganha nada — a parede comum, a laje e o pilar continuam custando o mesmo.
 *   · A cópia é uma malha à parte (userData.verso), com o MESMO material
 *     (nada compila a mais) e SEM a UV2: a luz dela vem das sondas, lidas
 *     pela normal invertida (o lado de dentro). O atlas da luz assada é da
 *     face da frente — o verso iluminado por ele seria a luz do lado de fora.
 *   · Fica fora da luz assada e das sondas (o cálculo delas já trata toda
 *     face como opaca dos dois lados) e não faz sombra (o material já faz
 *     sombra pelos dois lados: shadowSide DoubleSide).
 * Por que não DoubleSide em tudo: dobraria a rasterização de toda a obra
 * (as faces de dentro dos sólidos) e o atlas iluminaria o verso com a luz
 * da frente. Por que não mover só a câmera da régua: a pessoa andando na
 * sala via o jardim pela parede — o defeito é da imagem, não da régua.
 * ===================================================================== */

/* as peças ABERTAS de uma malha: devolve a lista de triângulos (índice t: vértices 3t, 3t+1, 3t+2 do índice) que estão em peça
   com aresta de borda. pos = Float32Array (x,y,z por vértice), idx = índices (ou null), tol = solda (m). Pura (testável em node). */
export function triangulosAbertos(pos, idx, tol) {
  const nV = pos.length / 3, T = Math.floor((idx ? idx.length : nV) / 3), q = 1 / (tol || 1e-4);
  if (!T) return [];
  /* solda por posição: a malha da cena repete o vértice em cada face (normal própria) */
  const sold = new Int32Array(nV), mapa = new Map();
  for (let i = 0; i < nV; i++) {
    const k = Math.round(pos[i * 3] * q) + ',' + Math.round(pos[i * 3 + 1] * q) + ',' + Math.round(pos[i * 3 + 2] * q);
    let s = mapa.get(k); if (s === undefined) { s = mapa.size; mapa.set(k, s); } sold[i] = s;
  }
  const vi = (t, c) => sold[idx ? idx[3 * t + c] : 3 * t + c];
  /* peças: triângulos que dividem vértice soldado */
  const paiV = new Int32Array(mapa.size); for (let i = 0; i < paiV.length; i++) paiV[i] = i;
  const raiz = (x) => { while (paiV[x] !== x) { paiV[x] = paiV[paiV[x]]; x = paiV[x]; } return x; };
  const unir = (a, b) => { a = raiz(a); b = raiz(b); if (a !== b) paiV[a] = b; };
  const arestas = new Map(), degen = new Uint8Array(T);
  for (let t = 0; t < T; t++) {
    const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);
    if (a === b || b === c || a === c) { degen[t] = 1; continue; }
    unir(a, b); unir(b, c);
    for (const [x, y] of [[a, b], [b, c], [c, a]]) { const k = x < y ? x * 4194304 + y : y * 4194304 + x; arestas.set(k, (arestas.get(k) || 0) + 1); }
  }
  /* peça aberta = tem aresta usada por UM triângulo só */
  const aberta = new Set();
  arestas.forEach((n, k) => { if (n === 1) aberta.add(raiz(Math.floor(k / 4194304))); });
  const out = [];
  for (let t = 0; t < T; t++) if (!degen[t] && aberta.has(raiz(vi(t, 0)))) out.push(t);
  return out;
}

/* a geometria do VERSO dos triângulos dados; THREE = o do motor.
   · enrolamento invertido (a frente passa a ser o outro lado);
   · a normal do vértice passa a apontar para o lado NOVO: negada se concordava com o enrolamento original; mantida se já
     discordava (triângulo "virado" do IFC — no telhado da Casa 487 havia 52 m² assim: negar deixava a telha vista de cima
     iluminada como se olhasse para baixo, cinza-escura);
   · RECUADA desloc (3 mm) para trás do lado novo: onde já existe uma face coincidente virada para o mesmo lado (película dos
     dois lados, laje + forro no mesmo plano) a original ganha no teste de profundidade — sem isso as duas brigavam (listras
     no telhado, 21/10/2026). Onde a face é aberta de verdade, 3 mm não se vê. */
export function geometriaVerso(THREE, geo, tris, desloc) {
  const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), U = geo.getAttribute('uv'), I = geo.index, n = tris.length * 3;
  const pos = new Float32Array(n * 3), nor = N ? new Float32Array(n * 3) : null, uv = U ? new Float32Array(n * 2) : null;
  const d = desloc == null ? 0.003 : desloc, ix = (t, c) => (I ? I.getX(3 * t + c) : 3 * t + c);
  let o = 0;
  for (const t of tris) {
    const a = ix(t, 0), b = ix(t, 1), c = ix(t, 2);
    const ux = P.getX(b) - P.getX(a), uy = P.getY(b) - P.getY(a), uz = P.getZ(b) - P.getZ(a), wx = P.getX(c) - P.getX(a), wy = P.getY(c) - P.getY(a), wz = P.getZ(c) - P.getZ(a);
    let gx = uy * wz - uz * wy, gy = uz * wx - ux * wz, gz = ux * wy - uy * wx; const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    for (const v of [a, c, b]) {
      pos[o * 3] = P.getX(v) + gx * d; pos[o * 3 + 1] = P.getY(v) + gy * d; pos[o * 3 + 2] = P.getZ(v) + gz * d;
      if (nor) { const nx = N.getX(v), ny = N.getY(v), nz = N.getZ(v), s = (nx * gx + ny * gy + nz * gz) >= 0 ? -1 : 1; nor[o * 3] = s * nx; nor[o * 3 + 1] = s * ny; nor[o * 3 + 2] = s * nz; }
      if (uv) { uv[o * 2] = U.getX(v); uv[o * 2 + 1] = U.getY(v); }
      o++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (nor) g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/* chave de um triângulo no MUNDO, sem ordem (os 3 vértices a 1 mm): o mesmo triângulo em qualquer malha, de qualquer lado */
function chaveTri(P, M, I, t, v3) {
  const k = [];
  for (let c = 0; c < 3; c++) { const v = I ? I.getX(3 * t + c) : 3 * t + c; v3.fromBufferAttribute(P, v).applyMatrix4(M); k.push(Math.round(v3.x * 1000) + ',' + Math.round(v3.y * 1000) + ',' + Math.round(v3.z * 1000)); }
  return k.sort().join('|');
}

/* põe na cena o verso das peças abertas de toda malha opaca de frente (antes da UV2: a cópia não leva uv1).
   O triângulo que já tem GÊMEO (o mesmo triângulo em outra face da obra — a película dos dois lados) fica sem verso.
   filtro(o) → false pula a malha (espelho, piso planar, entorno). luzes = as luminárias da cena ({posicao, largura,
   profundidade}): o CORPO da luminária não ganha verso — o verso dele seria iluminado pelas sondas logo abaixo da luz
   (milhares de lux a 20 cm de um painel) e virava um borrão branco no forro; na física o corpo fica ACIMA do painel, que
   só emite para baixo, e sai escuro (Casa 487, corredor, 21/10/2026). Devolve { malhas, triangulos, gemeos, luminaria, ms }. */
export function adicionarVersos(THREE, scene, filtro, luzes) {
  const t0 = performance.now(), cand = [], v3 = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.material || (o.userData && (o.userData.verso || o.userData.temVerso || o.userData.entorno))) return;
    const m = o.material; if (Array.isArray(m) || m.side !== THREE.FrontSide || m.transmission > 0 || m.transparent) return;
    if (filtro && filtro(o) === false) return;
    if (!o.geometry.getAttribute('position')) return;
    o.updateMatrixWorld(true); cand.push(o);
  });
  /* quantas vezes cada triângulo aparece na obra (todas as malhas candidatas) */
  const conta = new Map();
  cand.forEach((o) => { const g = o.geometry, P = g.getAttribute('position'), I = g.index, T = Math.floor((I ? I.count : P.count) / 3); for (let t = 0; t < T; t++) { const k = chaveTri(P, o.matrixWorld, I, t, v3); conta.set(k, (conta.get(k) || 0) + 1); } });
  const novos = []; let nt = 0, gem = 0, lum = 0;
  const perto = (luzes || []).filter((l) => l && Array.isArray(l.posicao)).map((l) => ({ p: l.posicao, r: Math.max(+l.largura || 0.2, +l.profundidade || 0.2) / 2 + 0.15 }));
  const c3 = new THREE.Vector3();
  const daLuminaria = (P, M, I, t) => {
    if (!perto.length) return false;
    c3.set(0, 0, 0); for (let c = 0; c < 3; c++) { v3.fromBufferAttribute(P, I ? I.getX(3 * t + c) : 3 * t + c); c3.add(v3); } c3.multiplyScalar(1 / 3).applyMatrix4(M);
    for (const q of perto) { const dx = c3.x - q.p[0], dy = c3.y - q.p[1], dz = c3.z - q.p[2]; if (dx * dx + dy * dy + dz * dz < q.r * q.r) return true; }
    return false;
  };
  /* ⚠ ABERTO NA OBRA INTEIRA, não por malha: o motor separa as faces por MATERIAL (a parede de reboco é uma malha, a ponta dela
     de outro material é outra), então quase toda malha sozinha tem borda — por malha, a obra inteira ganhava verso (o mapa da
     planta, js/bimmapaplanta.js, achou o mesmo: "a construção vai toda numa sopa só"). Os triângulos de todas as malhas
     candidatas vão juntos, no mundo, e a borda é a da sopa. */
  const base = [], nT = cand.reduce((s, o) => { const g = o.geometry; return s + Math.floor((g.index ? g.index.count : g.getAttribute('position').count) / 3); }, 0);
  const sopa = new Float32Array(nT * 9); let k9 = 0;
  cand.forEach((o) => {
    const g = o.geometry, P = g.getAttribute('position'), I = g.index, T = Math.floor((I ? I.count : P.count) / 3);
    base.push(k9 / 9);
    for (let t = 0; t < T; t++) for (let c = 0; c < 3; c++) { v3.fromBufferAttribute(P, I ? I.getX(3 * t + c) : 3 * t + c).applyMatrix4(o.matrixWorld); sopa[k9++] = v3.x; sopa[k9++] = v3.y; sopa[k9++] = v3.z; }
  });
  const abertoG = new Uint8Array(nT); triangulosAbertos(sopa, null).forEach((t) => { abertoG[t] = 1; });
  cand.forEach((o, mi) => {
    const g = o.geometry, P = g.getAttribute('position'), I = g.index, T = Math.floor((I ? I.count : P.count) / 3), b0 = base[mi];
    const todos = []; for (let t = 0; t < T; t++) if (abertoG[b0 + t]) todos.push(t);
    const tris = todos.filter((t) => {
      if (conta.get(chaveTri(P, o.matrixWorld, I, t, v3)) >= 2) { gem++; return false; }
      if (daLuminaria(P, o.matrixWorld, I, t)) { lum++; return false; }
      return true;
    });
    if (!tris.length) return;
    const ms = new THREE.Mesh(geometriaVerso(THREE, g, tris), o.material);
    ms.matrixAutoUpdate = o.matrixAutoUpdate; ms.position.copy(o.position); ms.quaternion.copy(o.quaternion); ms.scale.copy(o.scale);
    ms.castShadow = false; ms.receiveShadow = o.receiveShadow; ms.userData.verso = true; ms.name = (o.name || '') + ' (verso)';
    o.userData.temVerso = true; novos.push([o.parent || scene, ms]); nt += tris.length;
  });
  novos.forEach(([pai, ms]) => pai.add(ms));
  return { malhas: novos.length, triangulos: nt, gemeos: gem, luminaria: lum, ms: Math.round(performance.now() - t0) };
}

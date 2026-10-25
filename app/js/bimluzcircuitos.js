/* =====================================================================
 * bimluzcircuitos.js — INTERRUPTORES VIVOS do render ao vivo (frente I3
 * da maquete viva, 21/10/2026). Módulo ES importado pelo js/bimrendervivo.js.
 *
 * Pedido do Rogério: passear à noite apertando os interruptores; acender
 * tem de ser INSTANTÂNEO, a ~57 qps, com a luz física.
 *
 * COMO (as decisões e o porquê):
 *  1. QUEM ACENDE COM QUEM: js/bimcircuitos.js (comando da luminária; sem
 *     comando, um por ambiente — o contrato da ligação elétrica).
 *  2. LUZ ASSADA POR COMANDO: a luz assada de sempre (js/bimluzassada.js)
 *     passa a ser só sol + céu; cada comando é assado À PARTE (direta das
 *     luminárias dele + 3 rebotes, sem sol nem céu) e mesclado num atlas
 *     "empacotado" (os dois comandos mais fortes por texel, meio-float). Na
 *     tela o material soma EA·cor·aceso + EB·cor·aceso com bilinear à mão
 *     (o id não se interpola). Trocar um comando = trocar 1 texel da
 *     textura dos comandos: nada recompila, nada é refeito.
 *     Por que não um atlas por comando: Ultra = 7,6 M texels × 8 B = 61 MB
 *     por comando; a Casa 487 com 16 ambientes passaria de 900 MB de placa.
 *     O empacotado custa UM atlas a mais (61 MB) seja qual for o número de
 *     comandos.
 *  3. SONDAS POR COMANDO (as peças sem atlas: louça, folhagem, mobília
 *     densa): a direta de cada comando, com sombra, gravada à parte pelos
 *     workers (js/bimluzobra.js, grupos) e somada na CPU ao trocar
 *     (~30 mil sondas × 6 faces: alguns ms). Limite: o rebote da luz das
 *     luminárias não entra nas sondas (entra no atlas).
 *  4. O BRILHO DA LUMINÁRIA ACESA: um disco/retângulo/bulbo emissivo na
 *     face que acende, com a luminância física (cd/m²) × a pré-exposição —
 *     fora da luz assada e das sondas (userData.entorno).
 *  5. O CLIQUE: raio da câmera contra as luminárias e os interruptores do
 *     modelo, com a oclusão pelo BVH da própria luz assada (sem varrer a
 *     malha toda); interruptor de vários módulos: o módulo mais perto do
 *     clique (contrato: Comandos.split(",")[k]).
 * Paralelo (three-way) e intermediário funcionam pelo contrato (qualquer
 * ponto inverte o MESMO comando); o que a frente EL ainda não gravou
 * (interruptores no modelo) cai no "clique na luminária".
 * ===================================================================== */
import * as CORE from '../bim/vendor/jsm/pathtracer/three/three.core.js';
import * as GPU from '../bim/vendor/jsm/pathtracer/three/three.webgpu.js';
import { uniform, uniformArray, vec3, ivec2, float, floor, fract, clamp, textureLoad, uv, int, min as tmin } from '../bim/vendor/jsm/pathtracer/three/three.tsl.js';
import { comandosDe, mesclar, tabelaMeio, comporSondas, salaDoPonto, comandoDoModulo, idComando, paraMeio } from './bimcircuitos.js';

const THREE = Object.assign({}, CORE, GPU);
const MAXC = 255;                 /* comandos por obra (o texel 0 da textura das cores é o "vazio") */
const MAX_MEIO = 60000;

/* ---------------------------------------------------------------------
 * OS NÓS DO MATERIAL: a luz dos comandos acesos lida do atlas empacotado
 * --------------------------------------------------------------------- */
export class CircuitosNos {
  constructor() {
    const vaz = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    vaz.minFilter = vaz.magFilter = THREE.NearestFilter; vaz.generateMipmaps = false; vaz.needsUpdate = true;
    this._vazia = vaz; this.pac = vaz;
    /* cores × aceso: elemento i+1 = comando i (rgb, luminância 1 × aceso). ⚠ UNIFORME, não textura: o material do Ultra (2K +
       atlas + 6 sondas + céu + sombra) já usa 15 das 16 texturas por estágio que o WebGPU garante — com a textura das cores
       eram 17 e a placa recusava o material ("sampled textures (17) exceeds the maximum per-stage limit (16)", 21/10/2026) */
    this.coresArr = Array.from({ length: MAXC + 1 }, () => new THREE.Vector4());
    this.uCores = uniformArray(this.coresArr, 'vec4');
    this.uTam = uniform(new THREE.Vector2(1, 1)); this.uAtiva = uniform(0);
    const f = uv(1).mul(this.uTam).sub(0.5), i0 = floor(f), t = clamp(fract(f), 0, 1), lim = this.uTam.sub(1);
    let E = vec3(0);
    this.nosPac = [];
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy]) => {
      const ij = ivec2(clamp(i0.x.add(dx), 0, lim.x), clamp(i0.y.add(dy), 0, lim.y));
      const q = textureLoad(this.pac, ij); this.nosPac.push(q);
      const ca = this.uCores.element(int(tmin(q.x, float(MAXC)))), cb = this.uCores.element(int(tmin(q.z, float(MAXC))));
      const w = (dx ? t.x : t.x.oneMinus()).mul(dy ? t.y : t.y.oneMinus());
      E = E.add(ca.rgb.mul(q.y).add(cb.rgb.mul(q.w)).mul(w));
    });
    this.E = E.mul(this.uAtiva);   /* klux, como o atlas de sempre */
  }
  /* o atlas empacotado (mesma textura, dados novos; a 1ª vez troca a vazia — que só é descartada no fim) */
  carregar(dados, W, H) {
    const t = this.pac;
    if (t !== this._vazia && t.image.width === W && t.image.height === H) { t.image.data = dados; t.needsUpdate = true; return; }
    const n = new THREE.DataTexture(dados, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
    n.minFilter = n.magFilter = THREE.NearestFilter; n.generateMipmaps = false; n.flipY = false; n.colorSpace = THREE.NoColorSpace; n.needsUpdate = true;
    const velho = this.pac; this.pac = n; this.nosPac.forEach((no) => { no.value = n; });
    this.uTam.value.set(W, H); this.uAtiva.value = 1;
    if (velho !== this._vazia) setTimeout(() => { try { velho.dispose(); } catch (x) { /* já */ } }, 3000);
  }
  definirCores(lista) {
    this.coresArr.forEach((v) => v.set(0, 0, 0, 0));
    lista.forEach((c, i) => { if (i >= MAXC) return; const w = c.ligado ? 1 : 0; this.coresArr[i + 1].set(c.cor[0] * w, c.cor[1] * w, c.cor[2] * w, 1); });
  }
  descartar() { [this.pac, this._vazia].forEach((t) => { try { t.dispose(); } catch (e) { /* já */ } }); }
}

/* ---------------------------------------------------------------------
 * OS COMANDOS NA CENA (um por render ao vivo aberto)
 * --------------------------------------------------------------------- */
export class Circuitos {
  /* vivo = o RenderVivo; cena = a do BimRender (luzes com id, posicao, cor, fluxo, comando) */
  constructor(vivo, cena, op) {
    this.vivo = vivo; this.o = op || {};
    const G = typeof globalThis !== 'undefined' ? globalThis : window;
    this.G = G; this.origem = cena.origem || [0, 0, 0];
    this.salas = Circuitos.salas(this.origem);
    const reg = Circuitos.registro(G);
    const r = comandosDe(cena.luzes || [], this.salas, { nomes: reg.nomes, estado: this.o.estado || null });
    this.comandos = r.comandos; this.indice = r.indice; this.deLuz = r.deLuz;
    (cena.luzes || []).forEach((l) => { if (r.deLuz[l.id] != null) l.grupo = r.deLuz[l.id]; });
    this.luzesCena = cena.luzes || [];
    this.interruptores = Circuitos.interruptores(G, this.origem, this.salas, reg);
    this.ativo = this.comandos.length > 0;
    this.feitos = {}; this.pac = null; this.info = { comandos: this.comandos.length, assados: 0, msPorComando: [], descartados: 0, interruptores: this.interruptores.length };
    this._brilhos();
    vivo.circ.definirCores(this.comandos);
    this._ligarClique();
  }

  /* os ambientes do editor (contorno) e os IfcSpace (caixa), em coordenadas do motor */
  static salas(o) {
    const G = typeof globalThis !== 'undefined' ? globalThis : window, out = [];
    try {
      const st = G.BIM && G.BIM.editarEstado && G.BIM.editarEstado(), lista = (st && st.estado && st.estado.ambientes) || [];
      lista.forEach((a) => {
        const c = a && a.calc; if (!c || !c.contorno || c.contorno.length < 3) return;
        const pt = (p) => [(p.x != null ? p.x : p[0]) - o[0], (p.z != null ? p.z : p[1]) - o[2]];
        out.push({ id: a.id, nome: a.nome || ('Ambiente ' + a.id), contorno: c.contorno.map(pt), furos: (c.furos || []).map((f) => (f || []).map(pt)), base: c.base - o[1], topo: c.topo - o[1] });
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
          const k = 'ifc' + m.userData.expressID, b = porId[k] || (porId[k] = { id: k, nome: (m.userData.nome || 'Ambiente ' + m.userData.expressID), min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
          ['x', 'y', 'z'].forEach((e, j) => { b.min[j] = Math.min(b.min[j], bx.min[e] - o[j]); b.max[j] = Math.max(b.max[j], bx.max[e] - o[j]); });
        });
      });
      Object.keys(porId).forEach((k) => out.push(porId[k]));
    } catch (e) { /* sem IFC */ }
    return out;
  }
  /* o registro da ligação elétrica (frente EL, js/eletilum.js) quando carregado: nomes dos comandos e interruptores */
  static registro(G) {
    const out = { nomes: {}, porInterruptor: {} };
    try {
      const E = G.EletIlum, B = G.BIM, st = B && B.editarEstado && B.editarEstado();
      if (E && E.comandos && st && st.estado) {
        (E.comandos(st.estado, (f, t, i) => B.familiaAvaliar(f, t, i)) || []).forEach((c) => { out.nomes[c.id] = c.nome; (c.interruptores || []).forEach((it) => { out.porInterruptor[it.id] = out.porInterruptor[it.id] || []; out.porInterruptor[it.id][it.modulo | 0] = c.id; }); });
      }
    } catch (e) { /* sem o motor da ligação: os ambientes dão os nomes */ }
    return out;
  }
  /* os INTERRUPTORES do modelo (famílias mep "interruptor"): posição da placa, módulos e os comandos de cada um */
  static interruptores(G, o, salas, reg) {
    const out = [];
    try {
      const B = G.BIM, st = B && B.editarEstado && B.editarEstado();
      ((st && st.estado && st.estado.familias) || []).forEach((f) => {
        const av = B.familiaAvaliar ? B.familiaAvaliar(f.famId, f.tipoId, f.inst) : null;
        if (!av || !av.mep || av.mep.peca !== 'interruptor') return;
        const v = av.valores || {}, y = f.y - o[1] + (+v.Altura_montagem || 1.3), x = f.x - o[0], z = f.z - o[2];
        const nMod = Math.max(1, Math.round(+v.Modulos || 1));
        let cmds = String((f.inst && f.inst.Comandos) || v.Comandos || '');
        if (!cmds && reg.porInterruptor[f.id]) cmds = reg.porInterruptor[f.id].filter(Boolean).join(',');
        if (!cmds) { const s = salaDoPonto(salas, x, y, z); cmds = s ? idComando(s.id, 'geral') : ''; }
        out.push({ id: f.id, pos: [x, y, z], rotY: +f.rotY || 0, modulos: nMod, comandos: cmds, esquemas: String((f.inst && f.inst.Esquemas) || '') });
      });
    } catch (e) { /* sem editor */ }
    return out;
  }

  /* ------------------------------------------------ o estado */
  ligado(id) { const i = this.indice[id]; return i != null && this.comandos[i].ligado; }
  ligar(id, on) {
    const i = this.indice[id]; if (i == null) return null;
    const c = this.comandos[i]; c.ligado = on === undefined ? !c.ligado : !!on;
    this._aplicar();
    return c.ligado;
  }
  tudo(on) { this.comandos.forEach((c) => { c.ligado = !!on; }); this._aplicar(); return !!on; }
  estado() { const o = {}; this.comandos.forEach((c) => { o[c.id] = c.ligado; }); return o; }
  _aplicar() {
    const v = this.vivo;
    v.circ.definirCores(this.comandos);
    (this._uOn || []).forEach((u, i) => { u.value = this.comandos[i].ligado ? 1 : 0; });
    /* o tempo real sem atlas (Leve sem UV2, falha): as luzes do shader seguem o comando */
    this.luzesCena.forEach((l) => { const o = v.luzes[l.id]; if (o && l.grupo != null) o.userData.ligada = this.comandos[l.grupo].ligado; });
    if (v._luzesDoDia) v._luzesDoDia();
    this._agendarSondas();
    if (this.aoMudar) { try { this.aoMudar(this.estado()); } catch (e) { /* a tela não derruba */ } }
    v.mexeu();
  }

  /* ------------------------------------------------ o brilho da luminária acesa */
  _brilhos() {
    const v = this.vivo, g = this.grupo = new THREE.Group(); g.name = 'brilhos-luminarias'; g.userData.entorno = true;
    this._uOn = this.comandos.map((c) => uniform(c.ligado ? 1 : 0));
    const mats = {};
    this.luzesCena.forEach((l) => {
      if (l.grupo == null || !Array.isArray(l.posicao)) return;
      let geo, Lum, pos = new THREE.Vector3(l.posicao[0], l.posicao[1], l.posicao[2]);
      const m = new THREE.Object3D();
      if (l.tipo === 'painel') {
        const w = +l.largura || 0.2, h = +l.profundidade || w;
        geo = l.circular ? new THREE.CircleGeometry(w / 2 * 0.98, 32) : new THREE.PlaneGeometry(w * 0.98, h * 0.98);
        Lum = +l.luminancia || +l.intensidade || 0;
        m.rotation.order = 'YXZ'; m.rotation.y = l.rotY || 0; m.rotation.x = l.rotX == null ? -Math.PI / 2 : l.rotX;
        /* a face fica 0,3 mm do lado que acende (na frente do difusor) */
        const d = new THREE.Vector3(0, 0, -1).applyEuler(m.rotation); pos.addScaledVector(d, 0.0003);
      } else if (l.tipo === 'spot') {
        const r = 0.022; geo = new THREE.CircleGeometry(r, 20); Lum = (+l.intensidade || 0) / (Math.PI * r * r);
        const d = new THREE.Vector3().fromArray(l.dir || [0, -1, 0]).normalize();
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().negate()); pos.addScaledVector(d, 0.0005);
      } else {
        const r = 0.028; geo = new THREE.SphereGeometry(r, 16, 10); Lum = (+l.intensidade || 0) / (Math.PI * r * r); pos.y -= 0.05;
      }
      const k = l.grupo + ':' + (l.cor || []).map((x) => x.toFixed(3)).join(',') + ':' + Math.round(Lum);
      let mat = mats[k];
      if (!mat) {
        const cor = l.cor || [1, 1, 1], uC = uniform(new THREE.Color().setRGB(cor[0] * Lum, cor[1] * Lum, cor[2] * Lum, THREE.LinearSRGBColorSpace));
        mat = mats[k] = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, toneMapped: true });
        mat.colorNode = vec3(uC).mul(v.luz.uK).mul(this._uOn[l.grupo]).min(MAX_MEIO);
        mat.userData.brilho = true;
      }
      const ms = new THREE.Mesh(geo, mat); ms.position.copy(pos); ms.quaternion.copy(m.quaternion); if (l.tipo === 'painel') ms.rotation.copy(m.rotation);
      ms.castShadow = false; ms.receiveShadow = false; ms.userData.entorno = true; ms.userData.luz = l.id; ms.userData.comando = this.comandos[l.grupo].id;
      g.add(ms);
    });
    v.scene.add(g);
    this.info.brilhos = g.children.length;
  }

  /* ------------------------------------------------ o clique (luminária ou interruptor) */
  _ligarClique() {
    const el = this.vivo.canvas; let p0 = null;
    this._ev = [];
    const ev = (alvo, n, f) => { alvo.addEventListener(n, f); this._ev.push([alvo, n, f]); };
    ev(el, 'pointerdown', (e) => { p0 = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button }; });
    ev(el, 'pointerup', (e) => {
      if (!p0 || p0.b !== 0) return;
      const mov = Math.hypot(e.clientX - p0.x, e.clientY - p0.y), dt = performance.now() - p0.t; p0 = null;
      if (mov > 5 || dt > 450) return;
      const r = el.getBoundingClientRect(), a = this.alvoEm((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      if (a) { const on = this.ligar(a.comando); if (this.aoClique) { try { this.aoClique(a, on); } catch (x) { /* a tela não derruba */ } } }
    });
  }
  /* o que está sob o ponto da tela (fx, fy de 0 a 1): { tipo: 'luminaria'|'interruptor', id, comando } ou null */
  alvoEm(fx, fy) {
    const v = this.vivo, cam = v.camera, ray = new THREE.Ray();
    ray.origin.setFromMatrixPosition(cam.matrixWorld);
    ray.direction.set(fx * 2 - 1, -(fy * 2 - 1), 0.5).unproject(cam).sub(ray.origin).normalize();
    /* a superfície que o olho vê (BVH da luz assada; sem ela, nenhum bloqueio) */
    let tSup = Infinity;
    try { const bvh = v.assada && v.assada._bvh; if (bvh) { const h = bvh.raycastFirst(ray, THREE.DoubleSide, 0, 500); if (h) tSup = h.distance; } } catch (e) { /* sem BVH */ }
    let melhor = null;
    const testar = (p, raio, obj) => {
      const c = new THREE.Vector3(p[0], p[1], p[2]), t = c.clone().sub(ray.origin).dot(ray.direction); if (t < 0.05) return;
      const d = ray.at(t, new THREE.Vector3()).distanceTo(c); if (d > raio) return;
      if (t > tSup + 0.35) return;   /* atrás da parede */
      const nota = d / raio + t * 0.002; if (!melhor || nota < melhor.nota) melhor = Object.assign({ nota, t }, obj);
    };
    this.interruptores.forEach((s) => {
      testar(s.pos, 0.12, { tipo: 'interruptor', id: s.id, interruptor: s });
    });
    this.luzesCena.forEach((l) => {
      if (l.grupo == null) return;
      const raio = Math.max(0.12, Math.min(0.6, (+l.largura || 0.15) * 0.6));
      testar([l.posicao[0], l.posicao[1] - (l.tipo === 'pendente' ? 0.05 : 0), l.posicao[2]], raio, { tipo: 'luminaria', id: l.id, comando: this.comandos[l.grupo].id });
    });
    if (melhor && melhor.tipo === 'interruptor') {
      const s = melhor.interruptor;
      /* o módulo mais perto do ponto clicado (os módulos lado a lado na placa, ~2,4 cm cada, ao longo do X da peça) */
      const pt = ray.at(melhor.t, new THREE.Vector3()), ex = new THREE.Vector3(Math.cos(s.rotY), 0, -Math.sin(s.rotY));
      const u = pt.sub(new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2])).dot(ex), k = Math.max(0, Math.min(s.modulos - 1, Math.round(u / 0.024 + (s.modulos - 1) / 2)));
      melhor.modulo = k; melhor.comando = comandoDoModulo(s.comandos, k);
      if (!melhor.comando || this.indice[melhor.comando] == null) return null;
    }
    return melhor;
  }

  /* ------------------------------------------------ a luz assada por comando */
  /* assa os comandos que faltam (cancelado() para no meio; os prontos ficam). Chamado pelo motor depois da luz de sol/céu. */
  async assar(cancelado) {
    const v = this.vivo, A = v.assada; if (!A || !A.uv || !this.ativo) { this.info.erro = this.info.erro || 'sem luz assada'; return; }
    const pend = this.comandos.map((c, i) => i).filter((i) => !this.feitos[i]); if (!pend.length) { this.info.pronto = true; return; }
    const W = A.uv.largura, H = A.uv.altura, T = tabelaMeio();
    if (!this.pac || this.pac.length !== W * H * 4) { this.pac = new Uint16Array(W * H * 4); this.feitos = {}; }
    const esq = A.esq || {}, passadas = [[4], [8], [16, 'rapida']];   /* 3 rebotes da luz das luminárias */
    let ultimoEnvio = performance.now();
    this.info.assando = true;
    for (const i of pend) {
      if (cancelado && cancelado()) break;
      const c = this.comandos[i], luzes = this.luzesCena.filter((l) => l.grupo === i).map((l) => Object.assign({}, l, { ligada: true }));
      if (!luzes.length) { this.feitos[i] = true; continue; }
      const t0 = performance.now();
      let atlas = null;
      try {
        await A.calcular({ sol: null, ceu: null, luzes, passadas, amostrasLum: esq.luminarias || 48,
          cancelado: () => (cancelado && cancelado()) || !v.renderer,
          ritmoMs: () => (v.parado() > 1500 ? 16 : 8),
          aoResultado: (at) => { atlas = at; } });
      } catch (e) { this.info.erro = String(e && e.message || e); try { console.warn('luz por comando:', e); } catch (x) { /* sem console */ } break; }
      if (!atlas || (cancelado && cancelado())) break;
      const r = mesclar(this.pac, atlas.dados, i, T);
      this.feitos[i] = true; this.info.assados++; this.info.descartados += r.descartados;
      this.info.texelsComLuz = (this.info.texelsComLuz || 0) + r.texels; this.info.energiaDescartada = (this.info.energiaDescartada || 0) + r.energiaDescartada;
      this.info.energiaTotal = (this.info.energiaTotal || 0) + r.energia;
      this.info.msPorComando.push(Math.round(performance.now() - t0));
      if (this.aoProgresso) { try { this.aoProgresso(this.info.assados, this.comandos.length); } catch (x) { /* a tela não derruba */ } }
      /* manda à placa de tempos em tempos (61 MB no Ultra: não a cada comando) e no fim */
      if (performance.now() - ultimoEnvio > 4000 || Object.keys(this.feitos).length === this.comandos.length) { v.circ.carregar(this.pac, W, H); ultimoEnvio = performance.now(); v.mexeu(); }
    }
    if (Object.keys(this.feitos).length) v.circ.carregar(this.pac, W, H);
    this.info.assando = false;
    this.info.pronto = Object.keys(this.feitos).length === this.comandos.length;
    if (this.aoProgresso) { try { this.aoProgresso(this.info.assados, this.comandos.length); } catch (x) { /* a tela não derruba */ } }
    v.mexeu();
  }
  /* noite = sem sol (ou sol rasante): o assado dos comandos vem logo depois da rápida do céu */
  noite() { const s = this.vivo._solDados; return !s || !(s.lux > 2000); }

  /* ------------------------------------------------ as sondas por comando */
  carregarSondas(r) {
    this._sondas = r;
    this._acesosS = this.comandos.map((c) => (c.ligado ? 1 : 0));
    this._facesComp = comporSondas(r.faces, r.grupos, this._acesosS, null);
    this.vivo.luz.carregar(Object.assign({}, r, { faces: this._facesComp }));   /* a 1ª vez pelo caminho de sempre (cria as texturas) */
  }
  /* trocar um comando: o ATLAS já trocou (textura das cores); as sondas vêm logo depois, fora do clique — e só o que mudou:
     soma/subtrai a direta do grupo trocado e reescreve as 6 texturas no lugar (mesmo objeto: a regra das texturas trocadas) */
  _agendarSondas() { if (this._tSondas || !this._sondas) return; this._tSondas = setTimeout(() => { this._tSondas = 0; this._atualizarSondas(); }, 0); }
  _atualizarSondas() {
    const r = this._sondas, v = this.vivo; if (!r || !r.grupos || !this._facesComp) return;
    const t0 = performance.now(), G = r.grupos.n, d = r.grupos.dados, base = r.faces, out = this._facesComp, N = base[0].length >> 2;
    let mudou = 0;
    this.comandos.forEach((c, g) => {
      const on = c.ligado ? 1 : 0; if (g >= G || on === this._acesosS[g]) return;
      const sg = on ? 1 : -1; this._acesosS[g] = on; mudou++;
      for (let k = 0; k < N; k++) {
        if (base[0][k * 4 + 3] < 0) continue;
        const o = (k * G + g) * 18, j = k * 4;
        for (let e = 0; e < 6; e++) { const q = o + e * 3; out[e][j] += sg * d[q]; out[e][j + 1] += sg * d[q + 1]; out[e][j + 2] += sg * d[q + 2]; }
      }
    });
    if (!mudou) return;
    const tex = v.luz.tex;
    for (let e = 0; e < 6; e++) {
      const t = tex[e], f = out[e];
      if (!t || (t.userData && t.userData.vazio) || !t.image || !t.image.data || t.image.data.length !== f.length) { v.luz.carregar(Object.assign({}, r, { faces: out })); break; }
      const h = t.image.data;
      for (let i = 0; i < f.length; i++) { const c = i & 3, x = c === 3 ? f[i] : Math.max(0, f[i]) / 1000; h[i] = paraMeio(x > 65000 ? 65000 : x); }
      t.needsUpdate = true;
    }
    this.info.msSondas = Math.round(performance.now() - t0);
    v.mexeu();
  }
  /* as luzes para as sondas: todas, acesas, com o grupo (o motor manda "grupos" aos workers) */
  luzesSondas() { return this.luzesCena.filter((l) => l.grupo != null).map((l) => Object.assign({}, l, { ligada: true })); }

  descartar() {
    (this._ev || []).forEach(([a, n, f]) => a.removeEventListener(n, f)); this._ev = [];
    if (this.grupo && this.grupo.parent) this.grupo.parent.remove(this.grupo);
    if (this.grupo) this.grupo.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    if (this._tSondas) clearTimeout(this._tSondas);
    this.pac = null; this._sondas = null; this._facesComp = null;
  }
}

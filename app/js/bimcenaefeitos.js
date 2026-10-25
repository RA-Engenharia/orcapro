/* =====================================================================
 * bimcenaefeitos.js — os EFEITOS do módulo "OrçaPRO Cena" (23/10/2026)
 *
 * Quatro coisas que separam uma maquete de uma foto, ligáveis uma a uma e
 * com uma só entrada (`vivo.efeitos.definir(cfg)`):
 *
 *   RAIOS DE SOL (luz volumétrica)  espalhamento radial em espaço de tela a partir do sol: onde há luz
 *       livre entre a câmera e o sol (céu, janela clara) a luz "sangra" para a tela; o que está na frente
 *       (telhado, copa, parede) corta o raio. Passos 24/40/64 (leve/alta/ultra) com ruído por pixel que o
 *       TRAA do pipeline dilui. Desligado, o nó NÃO existe no grafo (custo zero): ligar/desligar refaz o
 *       pipeline (~1–2 s); mexer na força só troca um uniform.
 *   VENTO  a grama e as árvores do entorno (js/bimentorno.js, uniform `uVento`) e o TECIDO das cortinas
 *       (deslocamento de vértice só nas malhas marcadas `cortina` na origem — js/bimrender.js — e
 *       ancoradas no trilho: o peso do balanço é 0 no alto e 1 na barra).
 *   ÁGUA  o material `agua` ganha `normalNode` animado (4 ondas senoidais analíticas, direção ligada ao
 *       vento, sem textura nova: o material do Ultra já usa 15 das 16 texturas por estágio).
 *   FOGO/FUMAÇA  ainda não: devolve { on:false, motivo:'Entrega 2' }.
 *
 * ⚠ Funções PURAS no topo (normalização, vento, projeção do sol, ondas, pesos da cortina): testadas em
 *   node por tools/test-bimcenaefeitos.mjs. A parte TSL/GPU só roda no navegador com WebGPU.
 * ⚠ Importado ESTATICAMENTE por js/bimrendervivo.js (ganchos `[Cena: efeitos]`).
 * ===================================================================== */
import * as CORE from '../bim/vendor/jsm/pathtracer/three/three.core.js';
import * as GPU from '../bim/vendor/jsm/pathtracer/three/three.webgpu.js';
import {
  Fn, Loop, uv, uniform, float, vec2, vec3, vec4, attribute, positionLocal, normalLocal, normalWorld, sin, cos, mix, smoothstep, clamp,
  step, max, min, normalize, length, exp, pow, interleavedGradientNoise, screenCoordinate, transformNormalToView, instanceIndex, hash, select, pass
} from '../bim/vendor/jsm/pathtracer/three/three.tsl.js';

const THREE = Object.assign({}, CORE, GPU);

/* ---------------------------------------------------------------------
 * PARTE PURA
 * --------------------------------------------------------------------- */
export const PADRAO = {
  raios: { on: false, forca: 0.5 },
  vento: { on: true, forca: 0.5, dir: 53.13 },   /* 0,5 → vetor de módulo 1: o (0,8; 0,6) que o entorno tinha fixo */
  agua: { on: false, forca: 0.5 },
  fogo: { on: true, forca: 0.8 }   /* só há fogo onde alguém colocou (adicionarFogo): ligado = as chamas e a fumaça desses pontos */
};
export const PASSOS_RAIOS = { leve: 24, alta: 40, ultra: 64 };

export function limitar(v, a, b, pad) {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  if (!isFinite(n)) return pad;
  return n < a ? a : n > b ? b : n;
}
function ligado(v, pad) { return v === undefined || v === null ? pad : (v === 'false' || v === '0' ? false : !!v); }

/* cfg parcial (ou lixo) + a base → cfg completo e preso nas faixas. Campos ausentes mantêm a base. */
export function normalizar(cfg, base) {
  const b = base || PADRAO, c = cfg && typeof cfg === 'object' ? cfg : {};
  const sec = (k) => (c[k] && typeof c[k] === 'object' ? c[k] : {});
  const r = sec('raios'), v = sec('vento'), a = sec('agua'), fg = sec('fogo');
  let dir = limitar(v.dir, -1e6, 1e6, b.vento.dir); dir = ((dir % 360) + 360) % 360;   /* qualquer ângulo vira 0..360 */
  return {
    raios: { on: ligado(r.on, b.raios.on), forca: limitar(r.forca, 0, 1, b.raios.forca) },
    vento: { on: ligado(v.on, b.vento.on), forca: limitar(v.forca, 0, 1, b.vento.forca), dir: dir },
    agua: { on: ligado(a.on, b.agua.on), forca: limitar(a.forca, 0, 1, b.agua.forca) },
    fogo: { on: ligado(fg.on, b.fogo.on), forca: limitar(fg.forca, 0, 1, b.fogo.forca) }
  };
}

/* VENTO → vetor (x, z) do uniform `uVento` do entorno. `dir`: graus a partir de +Z (a "frente" do modelo) no sentido de +X,
   para onde o vento SOPRA. Módulo = 2 × forca (forca 0,5 = 1, o valor fixo de antes). Desligado: (0, 0) — parado, com a forma. */
export function vetorVento(v) {
  if (!v || !v.on) return [0, 0];
  const m = 2 * limitar(v.forca, 0, 1, 0), d = (limitar(v.dir, -1e6, 1e6, 0) * Math.PI) / 180;
  return [Math.sin(d) * m, Math.cos(d) * m];
}

/* O SOL NA TELA. cam: { quat:[x,y,z,w], fov (graus, vertical), aspect }. dir: direção PARA o sol (mundo). A câmera olha para −Z local.
   Devolve { uv:[u,v] (u→direita, v→para CIMA, 0..1), ndc:[x,y], frente:cosseno com o eixo de visão (>0 = à frente) } */
export function projetarSol(dir, cam) {
  /* v' = q⁻¹ v q (rotação inversa): leva a direção do mundo para o referencial da câmera. Com u = −(x,y,z) (conjugado):
     t = 2 u × v ; v' = v + w t + u × t */
  const w = cam.quat[3], ux = -cam.quat[0], uy = -cam.quat[1], uz = -cam.quat[2], vx = dir[0], vy = dir[1], vz = dir[2];
  const tx = 2 * (uy * vz - uz * vy), ty = 2 * (uz * vx - ux * vz), tz = 2 * (ux * vy - uy * vx);
  const cx = vx + w * tx + (uy * tz - uz * ty), cy = vy + w * ty + (uz * tx - ux * tz), cz = vz + w * tz + (ux * ty - uy * tx);
  const frente = -cz, th = Math.tan((cam.fov * Math.PI) / 360), asp = cam.aspect || 1;
  if (frente <= 1e-4) return { uv: [0.5, 0.5], ndc: [0, 0], frente: frente };
  const nx = cx / frente / (th * asp), ny = cy / frente / th;
  return { uv: [0.5 + nx / 2, 0.5 + ny / 2], ndc: [nx, ny], frente: frente };
}

/* quanto dos raios aparece: 0 com o sol atrás da câmera, abaixo do horizonte ou longe demais do quadro; cai suave de 1 (dentro do
   quadro) a 0 (a 1,2 quadro além da borda) — o raio de um sol fora da tela ainda ilumina a borda, mas some antes de virar artefato */
export function fadeSol(proj, solAcima) {
  if (!solAcima || !proj || proj.frente <= 0.02) return 0;
  const fora = Math.max(Math.abs(proj.ndc[0]), Math.abs(proj.ndc[1])) - 1;
  const dentro = fora <= 0 ? 1 : Math.max(0, 1 - fora / 1.2);
  return dentro * Math.min(1, (proj.frente - 0.02) / 0.15);
}

/* ONDAS DA ÁGUA: 4 senoides (comprimento de onda m, amplitude m, desvio da direção do vento em graus). A inclinação máxima por onda
   é a·k ≈ 0,04 (k = 2π/λ), então a soma fica abaixo de 0,17 × escala: reflexo que balança, sem a superfície "ferver". */
export const ONDAS = [
  { lambda: 3.0, a: 0.0190, dev: 0 }, { lambda: 1.7, a: 0.0110, dev: 28 }, { lambda: 0.9, a: 0.0060, dev: -35 }, { lambda: 0.45, a: 0.0030, dev: 70 }
];
export const ESCALA_AGUA = 1.6;   /* forca 1 → 1,6 × as amplitudes acima (inclinação ≤ 0,27): ainda água de piscina, não mar */
export function ondasAgua(forca, dirGraus) {
  const f = limitar(forca, 0, 1, 0) * ESCALA_AGUA, d0 = (limitar(dirGraus, -1e6, 1e6, 0) * Math.PI) / 180;
  return ONDAS.map((o) => {
    const k = (2 * Math.PI) / o.lambda, d = d0 + (o.dev * Math.PI) / 180;
    return { k: k, dx: Math.sin(d), dz: Math.cos(d), a: o.a * f, w: Math.sqrt(9.81 * k) * 0.55 };   /* velocidade ×0,55: a piscina anda mais devagar que o mar */
  });
}
/* inclinação (∂h/∂x, ∂h/∂z) da superfície no ponto (x, z) e no instante t — a MESMA conta que o shader faz */
export function inclinacaoAgua(ondas, x, z, t) {
  let gx = 0, gz = 0;
  for (const o of ondas) { const c = o.a * o.k * Math.cos(o.k * (o.dx * x + o.dz * z) - o.w * t); gx += c * o.dx; gz += c * o.dz; }
  return [gx, gz];
}

/* PESOS DA CORTINA. A malha de uma cortina é uma peça só; um grupo de render pode ter várias. Acha as peças (vértices ligados por
   triângulos), e dentro de cada uma o peso do balanço: 0 no ponto mais alto (o trilho, preso) e 1 na barra, com curva t^1,4 (o tecido
   pende mais livre embaixo). `fase` é por peça (cada cortina balança sozinha). Devolve { peso:Float32Array, fase:Float32Array, pecas }. */
export function pesosCortina(pos, idx) {
  const n = pos.length / 3, pai = new Int32Array(n);
  for (let i = 0; i < n; i++) pai[i] = i;
  const raiz = (i) => { while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; } return i; };
  const un = (a, b) => { a = raiz(a); b = raiz(b); if (a !== b) pai[a] = b; };
  const nt = idx ? idx.length : n;
  for (let t = 0; t + 2 < nt; t += 3) { const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2; un(a, b); un(b, c); }
  const mn = new Float32Array(n).fill(Infinity), mx = new Float32Array(n).fill(-Infinity), xs = new Float32Array(n), zs = new Float32Array(n), ct = new Uint32Array(n);
  for (let i = 0; i < n; i++) { const r = raiz(i), y = pos[i * 3 + 1]; if (y < mn[r]) mn[r] = y; if (y > mx[r]) mx[r] = y; xs[r] += pos[i * 3]; zs[r] += pos[i * 3 + 2]; ct[r]++; }
  const peso = new Float32Array(n), fase = new Float32Array(n); let pecas = 0;
  for (let i = 0; i < n; i++) {
    const r = raiz(i), h = mx[r] - mn[r];
    if (r === i) pecas++;
    peso[i] = h > 1e-4 ? Math.pow(Math.min(1, Math.max(0, (mx[r] - pos[i * 3 + 1]) / h)), 1.4) : 0;
    fase[i] = ((xs[r] / ct[r]) * 1.7 + (zs[r] / ct[r]) * 2.3) % 6.2831853;   /* determinística: a mesma cortina, a mesma fase */
  }
  return { peso: peso, fase: fase, pecas: pecas };
}

/* A cortina que balança: a família de cortina/persiana e o tipo NÃO sendo persiana/rolô/romana (esses são tela rígida num rolo).
   js/bimrender.js tem a mesma regra escrita à mão (é um script clássico, não importa este módulo): o teste confere as duas. */
export function ehCortinaMovel(famId, tipoId, nome) {
  if (!/cortina/i.test(String(famId || ''))) return false;
  return !/persiana|rolo|romana/i.test(String(tipoId || '') + ' ' + String(nome || ''));
}

/* ---------------------------------------------------------------------
 * FOGO: as contas por partícula (nós TSL). `vida(taxa)` = fração 0..1 do ciclo da partícula; s1,s2,s3 = ruído por partícula.
 * --------------------------------------------------------------------- */
export const PARTICULAS_FOGO = { chama: 40, fumaca: 14 };
export const BRILHO_CHAMA = 7e4;
/* ⚠ TETO da chama na imagem final (valor de tela, 1 = branco): à noite o olho abre ao máximo (EV 2,5) e 7e4 cd/m² × a exposição dava 10 000 — o
   bloom cobria o quadro inteiro de laranja. Com o teto o miolo satura em branco e o brilho em volta fica de chama, não de explosão. */
export const TETO_CHAMA = 3.2;   /* cd/m² da chama (fogueira ~1–3 × 10⁴): na exposição de um dia de sol vira laranja, no escuro vira clarão — como na foto */
function fogoPartes(vida, s1, s2, s3, base, esc, T, V) {
  const vento = vec3(V.x, 0, V.y);
  /* CHAMA: sobe ~0,95 m × escala, encolhe, balança, esfria do branco-amarelo ao vermelho-escuro e some */
  const lc = vida(1.1), invc = float(1).sub(lc), larg = s2.sub(0.5).mul(0.34 * esc).mul(invc), prof = s3.sub(0.5).mul(0.34 * esc).mul(invc);
  const balanco = sin(T.mul(9).add(s1.mul(40))).mul(0.05 * esc).mul(lc).add(sin(T.mul(5.3).add(s2.mul(30))).mul(0.04 * esc).mul(lc));
  const posC = base.add(vec3(larg.add(balanco), lc.mul(1.3 * esc), prof)).add(vento.mul(lc.mul(lc).mul(0.12 * esc)));
  const tC = mix(float(0.38), float(0.06), lc).mul(esc);
  const corC = mix(vec3(1.0, 0.84, 0.5), mix(vec3(1.0, 0.42, 0.08), vec3(0.4, 0.05, 0.01), smoothstep(0.45, 1.0, lc)), smoothstep(0.0, 0.45, lc));
  const alfaC = pow(invc, 1.3).mul(smoothstep(0.0, 0.06, lc)).mul(0.85);
  /* FUMAÇA: sobe até ~2,8 m × escala, abre em espiral, o vento a leva; cinza quente */
  const ls = vida(0.2), invs = float(1).sub(ls), espiral = ls.mul(6.0).add(s1.mul(6.28));
  const abre = ls.mul(0.55 * esc);
  const posS = base.add(vec3(0, 0.55 * esc, 0)).add(vec3(cos(espiral).mul(abre), ls.mul(2.6 * esc), sin(espiral).mul(abre))).add(vento.mul(ls.mul(ls).mul(1.7 * esc)));
  const tS = mix(float(0.28), float(1.25), ls).mul(esc);
  const alfaS = smoothstep(0.0, 0.14, ls).mul(pow(invs, 1.5)).mul(0.38);
  return { chama: { pos: posC, tam: vec2(tC.mul(0.5), tC.mul(2.0)), cor: corC, alfa: alfaC }, fumaca: { pos: posS, tam: vec2(tS, tS), alfa: alfaS } };
}

/* ---------------------------------------------------------------------
 * A CLASSE (navegador, WebGPU)
 * --------------------------------------------------------------------- */
export class EfeitosCena {
  constructor(vivo) {
    this.vivo = vivo; this.cfg = normalizar({}, PADRAO);
    this.uT = uniform(0); this.uQuadro = uniform(0);
    this.uVentoPano = uniform(new THREE.Vector2(0, 0));
    this.uAguaAmp = uniform(0); this.uAguaDir = uniform(new THREE.Vector2(0.8, 0.6));
    this.uRaiosForca = uniform(0); this.uSolUV = uniform(new THREE.Vector2(0.5, 0.5)); this.uSolFade = uniform(0); this.uSolCor = uniform(new THREE.Vector3(1, 0.95, 0.85));
    this.uBrilhoFogo = uniform(0); this.uFumaca = uniform(0); this._fogos = []; this._nFogo = 0;
    this.cenaFogo = new THREE.Scene(); this._passFogo = null; this._rc = null; this._nq = 0;   /* a 2ª cena dos fogos (ver adicionarFogo) */
    this.aguas = []; this.cortinas = []; this._raiosNoGrafo = false; this._fade = 0; this._proj = null; this._avisos = [];
    this._sync();
  }

  /* cfg parcial → aplica e devolve o cfg efetivo (preso nas faixas). Campos ausentes não mudam. */
  definir(cfg) {
    const antes = this.cfg;
    this.cfg = normalizar(cfg, antes);
    this._sync();
    if (this.cfg.raios.on !== this._raiosNoGrafo && this.vivo.pipeline) { this.vivo._montarPipeline(); }   /* o nó dos raios entra/sai do grafo */
    this.vivo.mexeu();
    return JSON.parse(JSON.stringify(this.cfg));
  }
  /* como definir(), mas só devolve quando o pipeline refeito já desenhou alguns quadros (para scripts de prova e a UI esperar) */
  async aplicar(cfg) {
    const r = this.definir(cfg), v = this.vivo, q0 = v._quadros || 0;
    for (let i = 0; i < 200 && (v._quadros || 0) < q0 + 12; i++) await new Promise((f) => setTimeout(f, 50));
    return r;
  }
  _sync() {
    const c = this.cfg, vv = vetorVento(c.vento);
    this.uVentoPano.value.set(vv[0], vv[1]);
    this.uAguaAmp.value = c.agua.on ? c.agua.forca * ESCALA_AGUA : 0;
    const d = (c.vento.dir * Math.PI) / 180; this.uAguaDir.value.set(Math.sin(d), Math.cos(d));
    this.uRaiosForca.value = c.raios.on ? c.raios.forca : 0;
    this.cenaFogo.visible = c.fogo.on && c.fogo.forca > 0;
  }

  /* por quadro (js/bimrendervivo.js rodar): relógio dos efeitos, vento do entorno, posição do sol na tela */
  quadro(dt) {
    this.uT.value += dt; this.uQuadro.value = (this.uQuadro.value + 1) % 4096;
    const v = this.vivo, e = v.entorno;
    if (this._fogos.length) this._visibilidade(dt);
    if (this._fogos.length) {   /* o fogo vive em unidades PRÉ-EXPOSTAS (× k, ver _preExpor) e a fumaça segue o brilho médio medido da cena */
      const k = v.k || 0, Lm = (v._ultMedida && v._ultMedida.Lmedia) || 3000, fg = this.cfg.fogo.on ? this.cfg.fogo.forca : 0;
      this.uBrilhoFogo.value = BRILHO_CHAMA * k * fg; this.uFumaca.value = Lm * 0.9 * k;
    }
    if (e && e.uVento) e.uVento.value.set(this.uVentoPano.value.x, this.uVentoPano.value.y);
    if (this.cfg.raios.on && this._raiosNoGrafo) {
      const sol = v._solDados, cam = v.camera;
      if (sol && sol.lux > 0 && sol.direcao) {
        const p = this._proj = projetarSol(sol.direcao, { quat: [cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w], fov: cam.fov, aspect: cam.aspect });
        this._fade = fadeSol(p, sol.direcao[1] > -0.02);
        this.uSolUV.value.set(p.uv[0], p.uv[1]); this.uSolFade.value = this._fade;
        const c = sol.cor || [1, 0.95, 0.85], m = Math.max(c[0], c[1], c[2], 1e-3); this.uSolCor.value.set(c[0] / m, c[1] / m, c[2] / m);
      } else { this._fade = 0; this.uSolFade.value = 0; }
    }
  }

  /* --------------------------------------------------------- RAIOS (chamado por _montarPipeline) */
  compor(comp, cor, prof) {
    this._raiosNoGrafo = false;
    if (!this.cfg.raios.on) return comp;
    this._raiosNoGrafo = true;
    const nome = Object.keys(PASSOS_RAIOS).find((k) => this.vivo.qual && this.vivo.qual.nome && this.vivo.qual.nome.toLowerCase() === k) || 'alta';
    const N = PASSOS_RAIOS[nome], decay = Math.pow(0.972, 64 / N);
    const sol = this.uSolUV, forca = this.uRaiosForca, fade = this.uSolFade, tint = this.uSolCor, quadro = this.uQuadro;
    const raios = Fn(() => {
      const p0 = uv(), alvo = sol.sub(p0), passo = alvo.mul(0.92 / N);
      /* ruído por pixel (ângulo áureo no tempo): cada pixel começa num ponto diferente do raio e o TRAA soma os quadros */
      const ruido = interleavedGradientNoise(screenCoordinate.add(quadro.mul(5.588238))), p = p0.add(passo.mul(ruido)).toVar();
      const acc = vec3(0).toVar(), peso = float(1).toVar();
      Loop(N, () => {
        p.addAssign(passo);
        const dentro = step(0, p.x).mul(step(p.x, 1)).mul(step(0, p.y)).mul(step(p.y, 1));
        const c = cor.sample(p).rgb, d = prof.sample(p).r;
        /* luz livre = céu (profundidade no fundo) OU pixel claro (janela, sol): o que está na frente (d < 1 e escuro) corta o raio.
           ⚠ o vidro escreve profundidade: sem o critério do brilho a janela inteira bloquearia a luz que entra por ela */
        const lum = c.x.mul(0.2126).add(c.y.mul(0.7152)).add(c.z.mul(0.0722));
        const ceu = step(0.99995, d), claro = smoothstep(0.9, 2.5, lum);
        const livre = max(ceu.mul(0.35), claro).mul(dentro);
        acc.addAssign(min(c, vec3(3)).mul(livre).mul(peso));
        peso.mulAssign(decay);
      });
      const dist = length(p0.sub(sol)), perto = exp(dist.mul(-1.3));
      return acc.div(N).mul(tint).mul(perto).mul(forca).mul(fade).mul(2.4);
    });
    return vec4(comp.rgb.add(raios()), comp.a);
  }

  /* --------------------------------------------------------- ÁGUA (chamado por _material quando o id é 'agua') */
  prepararAgua(m) {
    const T = this.uT, A = this.uAguaAmp, D = this.uAguaDir;
    const pos = positionLocal;   /* malha com a matriz identidade (coordenadas do mundo já gravadas na geometria) */
    let gx = float(0), gz = float(0);
    ONDAS.forEach((o) => {
      const k = (2 * Math.PI) / o.lambda, w = Math.sqrt(9.81 * k) * 0.55, dv = (o.dev * Math.PI) / 180, cd = Math.cos(dv), sd = Math.sin(dv);
      const dx = D.x.mul(cd).add(D.y.mul(sd)), dz = D.y.mul(cd).sub(D.x.mul(sd));   /* o vento girado em `dev` */
      const c = float(o.a * k).mul(cos(pos.x.mul(dx).add(pos.z.mul(dz)).mul(k).sub(T.mul(w))));
      gx = gx.add(c.mul(dx)); gz = gz.add(c.mul(dz));
    });
    /* só a face de CIMA da água ondula; as laterais do volume ficam como estão */
    const topo = step(0.7, normalWorld.y);
    const nW = normalize(normalWorld.add(vec3(gx.mul(A).negate().mul(topo), 0, gz.mul(A).negate().mul(topo))));
    m.normalNode = transformNormalToView(nW);
    m.userData.ondaAgua = true; this.aguas.push(m);
  }

  /* --------------------------------------------------------- CORTINA (chamado por preparar para grupos com `cortina`) */
  prepararCortina(malha, m) {
    const geo = malha.geometry, p = geo.getAttribute('position'); if (!p) return false;
    const w = pesosCortina(p.array, geo.index ? geo.index.array : null);
    geo.setAttribute('aCortina', new THREE.BufferAttribute(w.peso, 1)); geo.setAttribute('aFase', new THREE.BufferAttribute(w.fase, 1));
    if (!m.userData.pano) {
      const peso = attribute('aCortina', 'float'), fase = attribute('aFase', 'float'), T = this.uT, V = this.uVentoPano, pl = positionLocal;
      /* rajada: duas senoides defasadas no espaço (a onda "passa" pela cortina) + um piso positivo (o vento empurra, não só balança) */
      const g = sin(T.mul(1.3).add(fase).add(pl.x.mul(0.9)).add(pl.z.mul(0.7))).mul(0.6).add(sin(T.mul(2.9).add(fase.mul(1.7)).sub(pl.x.mul(1.3))).mul(0.25)).add(0.4);
      const empurra = vec3(V.x, 0, V.y).mul(g.mul(peso).mul(0.09));
      const infla = normalLocal.mul(sin(T.mul(2.1).add(fase).add(pl.y.mul(2.5))).mul(peso).mul(length(V)).mul(0.03));
      m.positionNode = pl.add(empurra).add(infla);
      m.userData.pano = true;
    }
    this.cortinas.push(malha); return true;
  }

  /* --------------------------------------------------------- FOGO E FUMAÇA (sprites instanciados, tudo em TSL, sem textura)
     adicionarFogo({ pos:[x,y,z] (coordenadas da CENA = BIM − origem), escala (1 = fogueira de ~0,8 m; 0,5 = churrasqueira) }) → id.
     Chama = 40 sprites que sobem, encolhem e esfriam (branco-amarelo → laranja → vermelho-escuro), somados à imagem; fumaça = 14 sprites
     comuns que sobem devagar, crescem e vão com o vento. Cada fogo = 2 desenhos.
     ⚠ NÃO ENTRAM NA CENA PRINCIPAL: o passe dela é MRT (cor, cor difusa, normal, velocidade) e lá o three desliga o blend de TODOS os
     alvos (padrão `getBlendMode` = sem blend): a chama saía como placa opaca e o rosa da partícula sujava a normal e a rugosidade que
     o SSGI/SSR leem. Eles vivem numa 2ª cena (`cenaFogo`), desenhada por um passe próprio SEM MRT e somada DEPOIS do TRAA e ANTES da
     exposição (as unidades pré-expostas × k valem).
     ⚠ OCLUSÃO por RAIO, não por profundidade: um raio da câmera ao fogo a cada 12 quadros (`_visibilidade`) contra as malhas da cena (sem vidro,
     entorno nem sprites); fogo atrás de parede some com fade de ~0,2 s. Oclusão PARCIAL (metade da chama atrás de uma quina) NÃO existe: Entrega 2.
     (A 1ª ideia foi "partícula mole" — comparar com a profundidade do passe principal. Na Casa 487 a chama sumia e levei uma rodada achando que a
     profundidade lida estava errada: o defeito era a posição — o terreno fora da casa fica ~1,2 m ACIMA do piso, o fogo estava enterrado e a
     oclusão estava certa. Por isso `chaoEm`. A partícula mole segue possível para a borda macia da chama no chão, sem urgência.)
     ⚠ A chama ainda NÃO ilumina o entorno (uma PointLight a mais recompilaria todo material da cena): Entrega 2, com a luz por circuito. */
  adicionarFogo(o) {
    const op = o || {}, pos = Array.isArray(op.pos) && op.pos.length === 3 && op.pos.every(isFinite) ? op.pos : null; if (!pos) return null;
    const id = 'fogo-' + (++this._nFogo);
    this._fogos.push({ id: id, pos: pos.map(Number), escala: limitar(op.escala, 0.2, 4, 1), grupo: null, semente: (this._nFogo * 7919) % 1000, uVis: uniform(1), alvoVis: 1 });
    this._fogosMudaram(); return id;
  }
  removerFogo(id) {
    const k = this._fogos.findIndex((f) => f.id === id); if (k < 0) return false;
    this._fogos.splice(k, 1); this._fogosMudaram(); return true;
  }
  /* a altura do CHÃO em (x, z) da cena: um raio para baixo contra as malhas (sem vidro, entorno nem sprites). null = não há chão ali.
     ⚠ Existe porque na Casa 487 o terreno fora da casa fica ~1,2 m ACIMA do piso da casa: pôr o fogo "no nível da casa" o enterrava no gramado
     (a oclusão estava certa e eu achei que era defeito dela). Quem coloca o fogo (a biblioteca da Cena) deve usar a altura devolvida aqui. */
  chaoEm(x, z, yDe) {
    const v = this.vivo; if (!v || !v.scene || !isFinite(x) || !isFinite(z)) return null;
    if (!this._rc) this._rc = new THREE.Raycaster();
    const bl = []; v.scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.visible || o.userData.entorno || o.userData.verso || !o.material) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m && (m.transmission > 0 || m.userData.id === 'espelho')) return;
      bl.push(o);
    });
    const y0 = isFinite(yDe) ? yDe : 200; this._rc.set(new THREE.Vector3(x, y0, z), new THREE.Vector3(0, -1, 0)); this._rc.far = y0 + 500;
    const h = this._rc.intersectObjects(bl, false)[0]; return h ? +(y0 - h.distance).toFixed(4) : null;
  }
  fogos() { return this._fogos.map((f) => ({ id: f.id, pos: f.pos.slice(), escala: f.escala, visivel: f.alvoVis > 0 })); }
  /* a lista de fogos mudou: refaz os sprites e, se o passe próprio entrou/saiu do grafo, o pipeline */
  _fogosMudaram() {
    const v = this.vivo; this._montarFogos();
    if (v && v.pipeline && !!this._passFogo !== (this._fogos.length > 0)) v._montarPipeline();
    if (v) v.mexeu();
  }
  _soltarFogos() {
    this.cenaFogo.traverse((o) => { if (o.material && o.material.dispose) { try { o.material.dispose(); } catch (e) { /* já descartado */ } } });
    this.cenaFogo.clear();
  }
  _montarFogos() {
    this._soltarFogos();
    this._fogos.forEach((f) => {
      const T = this.uT, V = this.uVentoPano, esc = f.escala, base = vec3(f.pos[0], f.pos[1], f.pos[2]);
      const grupo = f.grupo = new THREE.Group(); grupo.name = f.id; grupo.userData.fogo = true;
      const mk = (n, aditivo, posFn, tamFn, corFn, alfaFn) => {
        const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
        if (aditivo) { m.blending = THREE.CustomBlending; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; }   /* soma cor; NÃO mexe no alfa (a fumaça manda nele) */
        const i = float(instanceIndex), s1 = hash(i.add(f.semente)), s2 = hash(i.add(f.semente + 97)), s3 = hash(i.add(f.semente + 193));
        const r = fogoPartes((rate) => T.mul(rate).add(s1).fract(), s1, s2, s3, base, esc, T, V);
        m.positionNode = posFn(r); m.scaleNode = tamFn(r);
        m.colorNode = corFn(r); m.opacityNode = alfaFn(r, smoothstep(0.5, 0.0, length(uv().sub(0.5)))).mul(f.uVis);
        const s = new THREE.Sprite(m); s.count = n; s.frustumCulled = false; s.renderOrder = aditivo ? 6 : 5;
        return s;
      };
      grupo.add(mk(PARTICULAS_FOGO.fumaca, false, (r) => r.fumaca.pos, (r) => r.fumaca.tam, () => vec3(0.52, 0.49, 0.46).mul(this.uFumaca), (r, rad) => rad.mul(r.fumaca.alfa)));
      grupo.add(mk(PARTICULAS_FOGO.chama, true, (r) => r.chama.pos, (r) => r.chama.tam,
        (r) => { const c0 = r.chama.cor.mul(this.uBrilhoFogo), m = max(max(c0.x, c0.y), max(c0.z, 1e-4)); return c0.mul(min(float(1), float(TETO_CHAMA).div(this.vivo.uExpo || uniform(1)).div(m))); },
        (r, rad) => rad.mul(r.chama.alfa)));
      this.cenaFogo.add(grupo);
    });
    this.cenaFogo.visible = this.cfg.fogo.on && this.cfg.fogo.forca > 0;
  }
  /* chamado por _montarPipeline DEPOIS do TRAA: soma o passe dos fogos à imagem (base × (1 − alfa da fumaça) + cor acumulada) */
  posTraa(base) {
    if (this._passFogo) { try { this._passFogo.dispose(); } catch (e) { /* já descartado */ } this._passFogo = null; }
    if (!this._fogos.length) return base;
    const v = this.vivo;
    /* o passe limpa com o alfa do renderizador: com 0 o fundo fica transparente (o canvas final tem alfa 1 de qualquer jeito) */
    try { v.renderer.setClearAlpha(0); } catch (e) { /* sem renderer ainda */ }
    const p = this._passFogo = pass(this.cenaFogo, v.camera), col = p.getTextureNode('output');
    return base.mul(float(1).sub(clamp(col.a, 0, 1))).add(col.rgb);
  }
  /* a cada 12 quadros: o fogo está à vista? (raio da câmera até 0,6 m acima da base; o 1º que atinge algo mais perto que o fogo o esconde) */
  _visibilidade(dt) {
    const v = this.vivo, cam = v.camera;
    if (!this._fogos.length) return;
    if ((this._nq++ % 12) === 0 && v.scene) {
      if (!this._rc) this._rc = new THREE.Raycaster();
      const bloqueia = [];
      v.scene.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || !o.visible || o.userData.entorno || o.userData.verso || !o.material) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m && (m.transmission > 0 || m.userData.id === 'espelho')) return;   /* vidro e espelho deixam ver */
        bloqueia.push(o);
      });
      this._fogos.forEach((f) => {
        const alvo = new THREE.Vector3(f.pos[0], f.pos[1] + 0.6 * f.escala, f.pos[2]), d = alvo.clone().sub(cam.position), dist = d.length();
        this._rc.set(cam.position, d.normalize()); this._rc.far = dist;
        const h = this._rc.intersectObjects(bloqueia, false).filter((x) => x.distance < dist - 0.35)[0];
        f.alvoVis = h ? 0 : 1;
      });
    }
    this._fogos.forEach((f) => { const a = f.uVis.value, b = f.alvoVis; f.uVis.value = Math.abs(b - a) < 0.01 ? b : a + (b - a) * Math.min(1, dt * 8); });
  }

  /* CUSTO em ms de PLACA por quadro (consulta de tempo da placa, não depende da CPU nem do vsync) de um conjunto de efeitos contra tudo
     desligado — A B A B para a deriva da placa cair nos dois lados. Precisa de opcoes.medirGpu na abertura. O laço de 60 qps para
     durante a medida e volta no fim. */
  async medirCusto(cfgOn, quadros) {
    const v = this.vivo, r = v && v.renderer, n = quadros || 30; if (!r || !v.o.medirGpu || !v.pipeline) return null;
    const dorme = (ms) => new Promise((f) => setTimeout(f, ms)), salvo = JSON.parse(JSON.stringify(this.cfg)), cad = v.reflexo ? v.reflexo.cadencia : true;
    const DESLIGA = { raios: { on: false }, agua: { on: false }, vento: { on: false } };
    if (v.reflexo) v.reflexo.cadencia = false;   /* a câmera parada pularia os refletores: a medida é do quadro CHEIO */
    v.parar(); await dorme(500);
    const med = async (cfg) => {
      this.definir(cfg); const v2 = [];
      for (let i = 0; i < n + 6; i++) { this.quadro(0.016); v.pipeline.render(); const d = await r.resolveTimestampsAsync('render'); if (i >= 6 && d > 0) v2.push(d); }
      v2.sort((a, b) => a - b); return v2.length ? v2[v2.length >> 1] : null;   /* mediana: a placa é dividida com o PC todo */
    };
    const a1 = await med(cfgOn), b1 = await med(DESLIGA), a2 = await med(cfgOn), b2 = await med(DESLIGA);
    this.definir(salvo); if (v.reflexo) v.reflexo.cadencia = cad; v.rodar();
    const com = a1 != null && a2 != null ? (a1 + a2) / 2 : null, sem = b1 != null && b2 != null ? (b1 + b2) / 2 : null;
    return { comMs: com && +com.toFixed(3), semMs: sem && +sem.toFixed(3), custoMs: com != null && sem != null ? +(com - sem).toFixed(3) : null, quadros: n };
  }

  info() {
    const c = this.cfg, v = this.vivo;
    return {
      cfg: JSON.parse(JSON.stringify(c)),
      raios: { ativo: !!(c.raios.on && this._raiosNoGrafo), passos: this._raiosNoGrafo ? PASSOS_RAIOS[Object.keys(PASSOS_RAIOS).find((k) => v.qual && v.qual.nome && v.qual.nome.toLowerCase() === k) || 'alta'] : 0, fade: +this._fade.toFixed(3), solNaTela: this._proj ? this._proj.uv.map((x) => +x.toFixed(3)) : null, custoEstimadoMs: c.raios.on ? { leve: 0.4, alta: 0.7, ultra: 1.2 }[(v.qual && v.qual.nome || 'alta').toLowerCase()] || 0.7 : 0 },
      vento: { vetor: vetorVento(c.vento), entorno: !!v.entorno, cortinas: this.cortinas.length },
      agua: { materiais: this.aguas.length, amplitude: this.uAguaAmp.value },
      fogo: { on: c.fogo.on, pontos: this._fogos.length, chamas: this._fogos.length * PARTICULAS_FOGO.chama, fumaca: this._fogos.length * PARTICULAS_FOGO.fumaca, luzDoFogo: false /* Entrega 2: a chama ainda não ilumina a cena */ },
      avisos: this._avisos.slice()
    };
  }
  /* a cena foi trocada (limparCena): as listas de malhas/materiais acabaram */
  limpar() { this.aguas = []; this.cortinas = []; this._fogos = []; this._soltarFogos(); }
  descartar() { this.limpar(); try { if (this._passFogo) this._passFogo.dispose(); } catch (e) { /* já descartado */ } this._passFogo = null; this.vivo = null; }
}

/* =====================================================================
 * bimluzcache.js — [frente E3] CACHE DA LUZ CALCULADA do render ao vivo (módulo ES, importado por js/bimrendervivo.js)
 *
 * Abrir a Casa 487 levava ~3 min até a imagem completa: sondas de luz 121 s, luz assada rápida 109 s / completa 174 s. O resultado
 * só depende de UMA lista de coisas — então fica guardado no IndexedDB do navegador e a reabertura do mesmo modelo, na mesma hora,
 * carrega em segundos. A CHAVE é o resumo (SHA-256) de tudo que entra na conta:
 *   · a geometria que a luz vê (posição, uv1 do atlas, índice e matriz de cada malha, fora o entorno) e o albedo/vidro de cada material;
 *   · o sol (direção/lux/cor, quantizados: 0,6° e 2 %) e o céu (tamanho, foto/id/escala/giro, brilho médio quantizado a 5 %);
 *   · as luminárias ligadas (quando entram na conta) e a qualidade (passo, raios, passadas, texel);
 *   · o CÓDIGO do cálculo: o texto dos módulos de luz (bimluzassada, bimluzobra, bimluzassada-uv, bimluzluminarias) — mexeu no
 *     algoritmo, o cache velho some sozinho — e VERSAO deste arquivo.
 * Mudou uma parede, a hora, o céu ou uma luminária → a chave muda → recalcula (nunca serve luz de outra geometria).
 *
 * ⚠ Quantizar o sol é de propósito: a hora padrão segue o RELÓGIO (cfg.hora vazio) e sem isso cada minuto seria uma chave nova.
 *   Com a hora FIXA o resultado é idêntico bit a bit; seguindo o relógio vale a luz de até ~0,6° de sol de diferença (≈ 2,5 min).
 * Código puro + um armazém injetável (IndexedDB no navegador, memória nos testes: tools/test-bimluzcache.js).
 * ===================================================================== */
export const VERSAO = 1;
const MAX_BYTES = 640 * 1048576, MAX_ENTRADAS = 8;   /* poda: as mais recentes, até 640 MB / 8 entradas */

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
/* SHA-256 nativo (rápido: ~1 GB/s); sem crypto.subtle (página insegura), FNV-1a de 32 bits em dois sentidos como reserva */
export async function resumo(dados) {
  const sub = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle;
  const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : (ArrayBuffer.isView(dados) ? new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength) : new Uint8Array(dados));
  if (sub) return hex(await sub.digest('SHA-256', bytes));
  let a = 0x811c9dc5, b = 0x01000193 ^ 0xabcdef;
  for (let i = 0; i < bytes.length; i++) { a = Math.imul(a ^ bytes[i], 0x01000193) >>> 0; b = Math.imul(b ^ bytes[bytes.length - 1 - i], 0x85ebca6b) >>> 0; }
  return 'f' + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0') + bytes.length.toString(16);
}

/* o sol quantizado (direção a ~0,6°, lux e cor a 2 %): a mesma "hora" para o relógio andando ~2,5 min */
export function chaveSol(sol) {
  if (!sol) return 'sem-sol';
  const q = (v, p) => Math.round(v * p) / p, lg = (v) => (v > 0 ? Math.round(Math.log(v) / Math.log(1.02)) : 0);
  return JSON.stringify({ d: sol.direcao.map((v) => q(v, 100)), l: lg(sol.lux), c: (sol.cor || []).map((v) => q(v, 50)) });
}
/* o céu: tamanho, origem (foto/id/escala/giro) e o brilho médio em passos de 5 % — nunca os 2 MB de dados (variam com a hora de segundo em segundo) */
export function chaveCeu(ceu) {
  if (!ceu) return 'sem-ceu';
  let s = 0, n = 0; const d = ceu.dados || [], p = Math.max(1, Math.floor(d.length / 4 / 4096)) * 4;
  for (let i = 0; i < d.length; i += p) { s += d[i] + d[i + 1] + d[i + 2]; n += 3; }
  const med = n ? s / n : 0, f = ceu.foto || null;
  return JSON.stringify({ w: ceu.largura, h: ceu.altura, m: med > 0 ? Math.round(Math.log(med) / Math.log(1.05)) : 0, foto: f ? { id: f.id || null, escala: f.escala != null ? +(+f.escala).toPrecision(3) : null, giro: f.giroGraus != null ? Math.round(f.giroGraus) : null } : null });
}

/* a chave de UMA qualidade/estado de cena. `partes` = { geometria:[resumo…], materiais:string, sol, ceu, luzes, qualidade, codigo } (tudo já em texto/resumo) */
export async function chaveDe(partes) { return resumo(JSON.stringify({ v: VERSAO, ...partes })); }

/* o texto dos módulos do cálculo (memorizado): trocar uma linha do algoritmo troca a chave */
let _codigo = null;
export function resumoDoCodigo(urls, buscar) {
  if (_codigo) return _codigo;
  const f = buscar || (typeof fetch === 'function' ? fetch : null);
  _codigo = (async () => {
    if (!f) return 'sem-fetch';
    const tx = await Promise.all(urls.map((u) => f(u).then((r) => (r.ok ? r.text() : 'http' + r.status), () => 'erro')));
    return resumo(tx.join('\u0001'));
  })();
  return _codigo;
}
export function _esquecerCodigo() { _codigo = null; }

/* ----------------------------------------------------------------- o armazém */
/* IndexedDB: dois depósitos — `dados` (o valor grande) e `meta` (chave, tipo, tamanho, data: a poda lista só isto) */
export function armazemIDB(nome) {
  const nomeBD = nome || 'orcapro-luz-cache';
  let abrindo = null;
  const abrir = () => abrindo || (abrindo = new Promise((res, rej) => {
    const rq = indexedDB.open(nomeBD, 1);
    rq.onupgradeneeded = () => { const bd = rq.result; bd.createObjectStore('dados'); bd.createObjectStore('meta'); };
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error || new Error('IndexedDB'));
  }));
  const pedido = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  return {
    async get(k) { const bd = await abrir(); return pedido(bd.transaction('dados').objectStore('dados').get(k)); },
    async put(k, valor, meta) {
      const bd = await abrir();
      return new Promise((res, rej) => { const tx = bd.transaction(['dados', 'meta'], 'readwrite'); tx.objectStore('dados').put(valor, k); tx.objectStore('meta').put(meta, k); tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => rej(tx.error || new Error('gravação cancelada')); });
    },
    async del(k) { const bd = await abrir(); return new Promise((res) => { const tx = bd.transaction(['dados', 'meta'], 'readwrite'); tx.objectStore('dados').delete(k); tx.objectStore('meta').delete(k); tx.oncomplete = tx.onerror = tx.onabort = () => res(true); }); },
    async metas() { const bd = await abrir(); const st = bd.transaction('meta').objectStore('meta'); const ks = await pedido(st.getAllKeys()), vs = await pedido(st.getAll()); return ks.map((k, i) => Object.assign({ k }, vs[i])); }
  };
}
/* memória (testes) */
export function armazemMemoria() {
  const D = new Map(), M = new Map();
  return { async get(k) { return D.has(k) ? D.get(k) : undefined; }, async put(k, v, m) { D.set(k, v); M.set(k, m); return true; }, async del(k) { D.delete(k); M.delete(k); return true; }, async metas() { return Array.from(M, ([k, m]) => Object.assign({ k }, m)); } };
}

export class LuzCache {
  constructor(armazem) { this.a = armazem; this.ultimo = null; }
  /* lê { tipo, chave } → o valor ou null (falha do armazém nunca derruba o render) */
  async ler(chave, tipo) {
    const t0 = performance.now();
    try { const e = await this.a.get(chave + ':' + tipo); if (!e || e.chave !== chave || e.versao !== VERSAO) return null; this.ultimo = { tipo, ms: Math.round(performance.now() - t0), bytes: e.bytes }; return e.valor; }
    catch (x) { return null; }
  }
  /* grava e poda; devolve { ok, bytes } */
  async gravar(chave, tipo, valor, bytes) {
    try {
      await this.a.put(chave + ':' + tipo, { chave, versao: VERSAO, valor }, { chave, tipo, t: Date.now(), bytes });
      await this.podar(chave + ':' + tipo);
      return { ok: true, bytes };
    } catch (x) { return { ok: false, erro: String(x && x.message || x) }; }
  }
  /* mantém as mais recentes dentro do teto de bytes e de entradas (a que acabou de entrar nunca sai) */
  async podar(manter) {
    const ms = (await this.a.metas()).sort((x, y) => y.t - x.t);
    let soma = 0, n = 0;
    for (const m of ms) {
      soma += m.bytes || 0; n++;
      if (m.k !== manter && (soma > MAX_BYTES || n > MAX_ENTRADAS)) { soma -= m.bytes || 0; n--; await this.a.del(m.k); }
    }
    return { entradas: n, bytes: soma };
  }
  async limpar() { for (const m of await this.a.metas()) await this.a.del(m.k); }
}

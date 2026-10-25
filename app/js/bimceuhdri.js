/* =====================================================================
 * bimceuhdri.js — O CÉU FOTOGRAFADO (HDRI) DO RENDER (módulo ES, 20/10/2026)
 *
 * O céu calculado (Preetham + CIE, js/rendermat.js) acerta a LUZ, mas não
 * tem nuvem, nem horizonte, nem a "cara" de foto. Aqui um céu fotografado
 * de verdade (Poly Haven, CC0 — img/ceus/, manifesto data/ceus-hdri.json,
 * frente B) entra NO LUGAR da imagem do céu, com três cuidados para não
 * estragar a física que o resto do render usa:
 *
 *  1. O SOL DA FOTO SAI. O sol é a luz direcional com sombra (nítida) e a
 *     iluminância do js/rendermat.js; deixar o disco do sol na foto somaria
 *     um segundo sol, borrado, no reflexo e na luz da obra. Os pixels do
 *     disco viram a média do anel em volta.
 *  2. A FOTO GIRA para o sol dela ficar NA DIREÇÃO do sol da obra (local,
 *     norte, data e hora) — a sombra e o brilho do céu concordam.
 *  3. A FOTO É CALIBRADA: a iluminância horizontal do céu dela (sem o sol)
 *     vira a do céu calculado para a mesma hora e nuvens. A cor e as nuvens
 *     são da foto; a QUANTIDADE de luz é a física (lux, cd/m²).
 *
 * Saída no MESMO formato do RenderMat.ceu: { largura, altura, dados:
 * Float32 RGBA, linha 0 = embaixo (nadir) } — quem já usa o céu calculado
 * (o tempo real, a luz da obra, o path tracer) usa este sem mudar nada.
 * ===================================================================== */

const MANIFESTO = 'data/ceus-hdri.json';
let _manifesto = null;
const _cache = new Map();   /* url → hdr lido (a foto não muda; trocar a hora não relê o arquivo) */

export async function manifesto() {
  if (!_manifesto) _manifesto = fetch(MANIFESTO, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(MANIFESTO + ' ' + r.status); return r.json(); });
  return _manifesto;
}

/* ESCOLHA AUTOMÁTICA pela altura do sol e pelas nuvens da obra (0..1) */
export function escolher(lista, elevacao, nuvens) {
  const por = (t) => lista.filter((c) => c.tipo === t);
  const perto = (l, e) => l.slice().sort((a, b) => Math.abs(a.sol.elevacao - e) - Math.abs(b.sol.elevacao - e))[0];
  if (elevacao < -6) return por('noite')[0] || null;
  if (elevacao < 3) return por('entardecer-azul')[0] || por('por-do-sol')[0] || null;
  if (nuvens >= 0.65) return perto(por('nublado'), elevacao) || null;
  if (nuvens >= 0.25) return perto(por('parcialmente-nublado'), elevacao) || null;
  if (elevacao < 12) return por('por-do-sol')[0] || null;
  return perto(lista.filter((c) => /^limpo/.test(c.tipo)), elevacao) || null;
}

/* ---------------------------------------------------------------------
 * LEITOR RADIANCE (.hdr, RGBE): cabeçalho até a linha vazia, "-Y h +X w",
 * linhas no formato RLE novo (2,2,w>>8,w&255) ou cruas. Linha 0 = topo.
 * --------------------------------------------------------------------- */
export function lerHdr(buf) {
  const b = new Uint8Array(buf); let p = 0;
  const linha = () => { let s = ''; while (p < b.length && b[p] !== 10) s += String.fromCharCode(b[p++]); p++; return s; };
  const l0 = linha(); if (!/^#\?(RADIANCE|RGBE)/.test(l0)) throw new Error('não é um arquivo .hdr (Radiance)');
  for (;;) { const l = linha(); if (l === '' || p >= b.length) break; if (/^FORMAT=/.test(l) && !/32-bit_rle_rgbe/.test(l)) throw new Error('formato .hdr não suportado: ' + l); }
  const m = /-Y\s+(\d+)\s+\+X\s+(\d+)/.exec(linha()); if (!m) throw new Error('resolução do .hdr não reconhecida');
  const H = +m[1], W = +m[2], rgbe = new Uint8Array(W * H * 4), sl = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    if (W >= 8 && W < 32768 && b[p] === 2 && b[p + 1] === 2 && ((b[p + 2] << 8) | b[p + 3]) === W) {
      p += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < W) {
          let n = b[p++];
          if (n > 128) { n -= 128; const v = b[p++]; for (let k = 0; k < n; k++) sl[(x++) * 4 + c] = v; }
          else { for (let k = 0; k < n; k++) sl[(x++) * 4 + c] = b[p++]; }
        }
      }
      rgbe.set(sl, y * W * 4);
    } else { rgbe.set(b.subarray(p, p + W * 4), y * W * 4); p += W * 4; }
  }
  const f = new Float32Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const e = rgbe[i * 4 + 3];
    if (e) { const s = Math.pow(2, e - 136); f[i * 4] = rgbe[i * 4] * s; f[i * 4 + 1] = rgbe[i * 4 + 1] * s; f[i * 4 + 2] = rgbe[i * 4 + 2] * s; }
    f[i * 4 + 3] = 1;
  }
  return { largura: W, altura: H, dados: f };
}

export async function carregar(url) {
  if (!_cache.has(url)) _cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); }).then(lerHdr));
  return _cache.get(url);
}

const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

/* iluminância horizontal do hemisfério de cima de um céu (linha 0 = embaixo, como o RenderMat) */
function iluminancia(c) {
  const W = c.largura, H = c.altura, d = c.dados; let E = 0;
  for (let y = Math.floor(H / 2); y < H; y++) {
    const el = ((y + 0.5) / H - 0.5) * Math.PI, dw = Math.cos(el) * (Math.PI / H) * (2 * Math.PI / W), s = Math.sin(el);
    if (s <= 0) continue;
    for (let x = 0; x < W; x++) E += lum(d, (y * W + x) * 4) * s * dw;
  }
  return E;
}

/* ---------------------------------------------------------------------
 * O CÉU PRONTO: a foto sem sol, girada para o sol da obra e na luz física
 * hdr: o lido (linha 0 = topo) · info: entrada do manifesto · solDir: [x,y,z] do sol da obra (y para cima)
 * ref: o céu calculado da mesma hora (RenderMat.ceu) para a calibração
 * --------------------------------------------------------------------- */
export function preparar(hdr, info, solDir, ref) {
  const W = hdr.largura, H = hdr.altura, src = hdr.dados, out = new Float32Array(W * H * 4);
  /* giro: o u do sol da obra (a mesma conta do equirectUV do three) menos o u do sol da foto */
  const uObra = Math.atan2(solDir[2], solDir[0]) / (2 * Math.PI) + 0.5;
  const du = ((uObra - info.sol.azimuteU) % 1 + 1) % 1, dx = Math.round(du * W);
  for (let y = 0; y < H; y++) {
    const yo = H - 1 - y;   /* vira: linha 0 do arquivo = topo; aqui linha 0 = embaixo */
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, o = (yo * W + ((x + dx) % W)) * 4;
      out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; out[o + 3] = 1;
    }
  }
  const ceu = { largura: W, altura: H, dados: out };
  /* tira o disco do sol (ou da lua): o que passa de 20 × a média do anel de 4–8° vira a média do anel */
  if (info.sol && info.sol.visivel) {
    const el = info.sol.elevacao * Math.PI / 180, u = (info.sol.azimuteU + du) % 1, az = (u - 0.5) * 2 * Math.PI;
    const s = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
    const dir = (x, y) => { const e = ((y + 0.5) / H - 0.5) * Math.PI, a = ((x + 0.5) / W - 0.5) * 2 * Math.PI; return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)]; };
    const yc = Math.round((el / Math.PI + 0.5) * H - 0.5), r = Math.ceil(9 / 180 * H) + 1;
    const anel = [0, 0, 0]; let na = 0; const disco = [];
    for (let y = Math.max(0, yc - r); y <= Math.min(H - 1, yc + r); y++) for (let k = -Math.ceil(r / Math.max(0.2, Math.cos(el))) - 2; k <= Math.ceil(r / Math.max(0.2, Math.cos(el))) + 2; k++) {
      const x = ((Math.round(u * W) + k) % W + W) % W, v = dir(x, y), ang = Math.acos(Math.max(-1, Math.min(1, v[0] * s[0] + v[1] * s[1] + v[2] * s[2]))) * 180 / Math.PI, i = (y * W + x) * 4;
      if (ang >= 4 && ang <= 8) { anel[0] += out[i]; anel[1] += out[i + 1]; anel[2] += out[i + 2]; na++; } else if (ang < 4) disco.push(i);
    }
    if (na) {
      anel[0] /= na; anel[1] /= na; anel[2] /= na; const la = 0.2126 * anel[0] + 0.7152 * anel[1] + 0.0722 * anel[2];
      disco.forEach((i) => { if (lum(out, i) > 20 * la) { out[i] = anel[0]; out[i + 1] = anel[1]; out[i + 2] = anel[2]; } });
    }
  }
  /* calibra: a luz do céu da foto = a do céu calculado (sem sol nos dois) */
  const Ef = iluminancia(ceu), Er = ref ? iluminancia(ref) : 0;
  const k = Ef > 0 && Er > 0 ? Er / Ef : 1;
  for (let i = 0; i < out.length; i += 4) { out[i] *= k; out[i + 1] *= k; out[i + 2] *= k; }
  ceu.foto = { id: info.id, nome: info.nome, autores: info.autores, link: info.link, escala: k, giroGraus: Math.round(du * 360) };
  return ceu;
}

/* [entrega pesada, 25/10/2026] os .hdr NÃO vêm no pacote (76 MB): o js/bimpesado.js baixa o céu escolhido, uma vez, e guarda.
   Enquanto não chegou (ou sem rede) ceuFoto devolve null — quem chamou segue no céu CALCULADO — e, chegando, chama
   op.aoChegar(id) para a tela refazer o céu. op.fonte: o módulo (teste) ou false (o caminho antigo, arquivo ao lado do app). */
let _fonte = null;
async function fonte(op) {
  if (op && op.fonte === false) return null;
  if (op && op.fonte) return op.fonte;
  if (!_fonte) _fonte = import('./bimpesado.js').catch(() => null);
  return _fonte;
}

/* tudo junto: escolhe (ou usa o pedido), carrega, prepara. resolucao: '2k' (tela) ou '1k' */
export async function ceuFoto(op) {
  const m = await manifesto(), lista = m.ceus || [];
  const info = (op.id && lista.find((c) => c.id === op.id)) || escolher(lista, op.elevacao, op.nuvens || 0);
  if (!info) return null;
  const rel = info.arquivos[op.resolucao || '2k'] || info.arquivos['1k'];
  let url = rel;
  const F = await fonte(op);
  if (F) {
    const d = await F.disponiveis([rel]);
    if (d.urls[rel]) url = d.urls[rel];
    else if (d.desconhecidos.indexOf(rel) < 0) {
      F.baixar([rel], { rotulo: 'céu de alta qualidade' }).then((r) => { if (r && r.ok && typeof op.aoChegar === 'function') { try { op.aoChegar(info.id); } catch (e) { /* a tela já fechou */ } } });
      return null;
    }
  }
  const hdr = await carregar(url);
  return preparar(hdr, info, op.solDir, op.ref);
}

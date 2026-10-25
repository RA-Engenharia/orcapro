/* =====================================================================
 * bimcircuitos.js — OS COMANDOS DE LUZ do render ao vivo (frente I3,
 * "interruptores vivos", 21/10/2026). Módulo ES PURO (sem three, sem DOM):
 * importado pelo js/bimluzcircuitos.js e testado em node
 * (tools/test-bimcircuitos.mjs).
 *
 * QUEM ACENDE COM QUEM (contrato da ligação, docs/eletrica/CONTRATO-ILUMINACAO.md):
 *  1. a luminária com `Comando` (ou o legado `Circuito`) entra nesse comando;
 *  2. sem comando: UM COMANDO POR AMBIENTE — o interruptor do cômodo comanda
 *     as luzes do cômodo. O id é o mesmo que a ligação elétrica gravaria
 *     (cmd-<ambienteId>-geral): quando ela chegar, o estado aceso/apagado
 *     continua valendo;
 *  3. luminária fora de todo ambiente (IFC sem IfcSpace, área externa):
 *     comando "cmd-geral".
 * O estado é POR COMANDO (um booleano). Clicar no módulo k de um
 * interruptor inverte Comandos.split(",")[k] — paralelo e intermediário
 * funcionam sozinhos com isso (qualquer ponto inverte o mesmo estado).
 *
 * A LUZ ASSADA POR COMANDO (o atlas "empacotado"): cada comando é assado à
 * parte (direta + rebotes, sem sol nem céu) e, por texel, ficam os DOIS
 * comandos que mais iluminam aquele texel: (idA, EA, idB, EB) em meio-float,
 * E = luminância em klux. Na tela: E = EA·cor[idA]·aceso[idA] + EB·cor[idB]·
 * aceso[idB] — trocar um comando é trocar UM texel da textura dos comandos.
 * Limite (medido no teste): o 3º comando que ilumina o mesmo texel (porta
 * aberta entre três cômodos) é descartado; a cor do rebote vira a cor da luz.
 * ===================================================================== */

export const COMANDO_GERAL = 'cmd-geral';

function semAcento(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
export function idComando(ambId, nome) { return 'cmd-' + ambId + '-' + semAcento(nome || 'geral').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

/* ------------------------------------------------ geometria em planta */
function dentro(P, x, z) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
function area(P) { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
/* salas = [{ id, nome, contorno:[[x,z]], furos, base, topo }] ou caixas [{ id, nome, min:[x,y,z], max }]; o MENOR ambiente que contém o ponto */
export function salaDoPonto(salas, x, y, z) {
  let melhor = null, am = Infinity;
  (salas || []).forEach((s) => {
    if (s.min && s.max) {
      if (x < s.min[0] || x > s.max[0] || z < s.min[2] || z > s.max[2] || y < s.min[1] - 0.3 || y > s.max[1] + 0.6) return;
      const a = (s.max[0] - s.min[0]) * (s.max[2] - s.min[2]); if (a < am) { am = a; melhor = s; } return;
    }
    if (!s.contorno || s.contorno.length < 3) return;
    if (y < s.base - 0.3 || y > s.topo + 0.6) return;
    if (!dentro(s.contorno, x, z) || (s.furos || []).some((f) => f && f.length > 2 && dentro(f, x, z))) return;
    const a = s.area || (s.area = area(s.contorno)); if (a < am) { am = a; melhor = s; }
  });
  return melhor;
}

/* ------------------------------------------------ os comandos
   luzes = as luzes da cena (motor): { id, posicao, cor, fluxo, comando?, circuito? };
   op = { nomes: { cmdId: nome } (o registro da ligação), estado: { cmdId: bool } (aceso/apagado salvo) }
   → { comandos: [{ id, nome, ambiente, luzes:[id], cor:[r,g,b], fluxo, ligado }], indice: { cmdId: i }, deLuz: { luzId: i } } */
export function comandosDe(luzes, salas, op) {
  op = op || {};
  const lista = [], indice = {}, deLuz = {};
  (luzes || []).forEach((l) => {
    if (!l || !Array.isArray(l.posicao)) return;
    let id = String(l.comando || l.circuito || '').trim(), sala = null;
    sala = salaDoPonto(salas, l.posicao[0], l.posicao[1], l.posicao[2]);
    if (!id) id = sala ? idComando(sala.id, 'geral') : COMANDO_GERAL;
    let i = indice[id];
    if (i == null) {
      i = indice[id] = lista.length;
      const nome = (op.nomes && op.nomes[id]) || (sala ? sala.nome : (id === COMANDO_GERAL ? 'Geral' : id));
      lista.push({ id, nome, ambiente: sala ? sala.id : null, luzes: [], cor: [0, 0, 0], fluxo: 0, ligado: !(op.estado && op.estado[id] === false) });
    }
    const c = lista[i], f = +l.fluxo || 0, cor = l.cor || [1, 1, 1];
    c.luzes.push(l.id); c.fluxo += f; c.cor[0] += cor[0] * f; c.cor[1] += cor[1] * f; c.cor[2] += cor[2] * f;
    deLuz[l.id] = i;
  });
  /* cor do comando = média das cores (luminância 1) pesada pelo fluxo */
  lista.forEach((c) => { const L = 0.2126 * c.cor[0] + 0.7152 * c.cor[1] + 0.0722 * c.cor[2]; c.cor = L > 0 ? c.cor.map((v) => v / L) : [1, 1, 1]; });
  return { comandos: lista, indice, deLuz };
}

/* clicar no módulo k do interruptor: o comando que ele inverte (ou null) */
export function comandoDoModulo(comandosTxt, k) { const l = String(comandosTxt || '').split(',').map((s) => s.trim()).filter(Boolean); return l.length ? l[Math.max(0, Math.min(l.length - 1, k | 0))] : null; }

/* ------------------------------------------------ meio-float rápido (tabela) */
const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer);
let TAB = null;
export function tabelaMeio() {
  if (TAB) return TAB;
  TAB = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) {
    const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    TAB[h] = e === 0 ? s * Math.pow(2, -14) * (m / 1024) : (e === 31 ? (m ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + m / 1024));
  }
  return TAB;
}
export function paraMeio(v) {
  F32[0] = v; const x = U32[0], s = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if (e >= 31) return s | 0x7bff;                         /* satura no maior finito (65504) */
  if (e <= 0) { if (e < -10) return s; m = (m | 0x800000) >> (1 - e); return s | ((m + 0x1000) >> 13); }
  const r = s | (e << 10) | ((m + 0x1000) >> 13);
  return r;
}

/* ------------------------------------------------ o atlas empacotado
   pac: Uint16Array(W·H·4) meio-float (idA+1, EA, idB+1, EB) — id 0 = vazio. atlas: o resultado da luz assada de UM comando
   (Uint16Array meio-float RGBA, rgb em klux). Mescla o comando `id` (0-based) mantendo os dois mais fortes por texel.
   Devolve { texels, descartados, energiaDescartada (klux·texel) } para a régua do limite. */
export function mesclar(pac, atlas, id, tab) {
  const T = tab || tabelaMeio(), n = Math.min(pac.length, atlas.length) >> 2, cod = paraMeio(id + 1);
  let texels = 0, desc = 0, eDesc = 0, eTot = 0;
  for (let t = 0; t < n; t++) {
    const k = t * 4;
    if (T[atlas[k + 3]] < -0.5) continue;
    const E = 0.2126 * T[atlas[k]] + 0.7152 * T[atlas[k + 1]] + 0.0722 * T[atlas[k + 2]];
    if (!(E > 1e-6)) continue;
    texels++; eTot += E;
    const ea = pac[k] ? T[pac[k + 1]] : -1, eb = pac[k + 2] ? T[pac[k + 3]] : -1;
    if (!pac[k]) { pac[k] = cod; pac[k + 1] = paraMeio(E); }
    else if (!pac[k + 2]) { pac[k + 2] = cod; pac[k + 3] = paraMeio(E); }
    else {
      const menor = ea <= eb ? 0 : 2, em = Math.min(ea, eb);
      if (E > em) { pac[k + menor] = cod; pac[k + menor + 1] = paraMeio(E); eDesc += em; } else eDesc += E;
      desc++;
    }
  }
  return { texels, descartados: desc, energiaDescartada: eDesc, energia: eTot };
}
/* o que a tela calcula num texel (para o teste): Σ E·cor·aceso dos dois comandos */
export function luzDoTexel(pac, t, cores, acesos, tab) {
  const T = tab || tabelaMeio(), k = t * 4, o = [0, 0, 0];
  [0, 2].forEach((s) => {
    if (!pac[k + s]) return;
    const i = Math.round(T[pac[k + s]]) - 1, E = T[pac[k + s + 1]], w = acesos[i] ? 1 : 0, c = cores[i] || [1, 1, 1];
    o[0] += E * c[0] * w; o[1] += E * c[1] * w; o[2] += E * c[2] * w;
  });
  return o;
}

/* ------------------------------------------------ as sondas por comando (js/bimluzobra.js com grupos)
   base = faces[6] (Float32Array N·4: rgb lux, a = céu/validade) SEM luminária; grupos = { n, dados: Float32Array(N·n·18) }
   (por sonda, por grupo, 6 faces × rgb: a DIRETA das luminárias do grupo, com sombra). acesos[g] = 0/1.
   Devolve faces novas (a soma) — a sonda inválida segue inválida. */
export function comporSondas(base, grupos, acesos, saida) {
  const N = base[0].length >> 2, G = grupos ? grupos.n : 0, d = grupos ? grupos.dados : null;
  const out = saida || base.map((f) => new Float32Array(f.length));
  for (let e = 0; e < 6; e++) out[e].set(base[e]);
  if (!G) return out;
  for (let k = 0; k < N; k++) {
    if (base[0][k * 4 + 3] < 0) continue;
    for (let g = 0; g < G; g++) {
      if (!acesos[g]) continue;
      const o = (k * G + g) * 18;
      for (let e = 0; e < 6; e++) { const j = k * 4; out[e][j] += d[o + e * 3]; out[e][j + 1] += d[o + e * 3 + 1]; out[e][j + 2] += d[o + e * 3 + 2]; }
    }
  }
  return out;
}
